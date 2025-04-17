const mongoose = require("mongoose");
const UserModel = require("../../models/userModel");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getProfileDashboard = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await UserModel.findById(req.userId)
            .select("-password")
            .session(session);

        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User not found" });
        }

        if (!Array.isArray(user.activePackage) || user.activePackage.length === 0) {
            user.activePackage = [];
            await user.save({ session });
        } else {
            const indexToRemove = user.activePackage.findIndex((pkg, index) => {
                return index !== 0 && pkg.pendingDate === 0;
            });

            if (indexToRemove > 0) {
                user.activePackage.splice(indexToRemove, 1);
                await user.save({ session });
            }
        }

        if (user.premiumAccess) {
            const premiumExpiresAt = new Date(user.premiumExpiresAt);
            const currentTimestamp = Date.now();
            const expiresTimestamp = premiumExpiresAt.getTime();
            const reduceDate = expiresTimestamp - currentTimestamp;

            if (reduceDate < 0) {
                user.premiumAccess = false;
                user.isPremium = false;
                user.premiumExpiresAt = null;

                if (user.activePackage.length > 0) {
                    const nextPackage = user.activePackage[1];
                    if (nextPackage) {
                        nextPackage.activeDate = new Date(
                            currentTimestamp + nextPackage.pendingDate * 24 * 60 * 60 * 1000
                        );
                        nextPackage.statusActive = true;
                        nextPackage.pendingDate = 0;

                        user.premiumExpiresAt = nextPackage.activeDate;
                        user.subscriptionPackage = nextPackage.packageId;
                        user.isPremium = true;
                        user.premiumAccess = true;
                    }
                    user.activePackage.shift();
                }

                if (user.activePackage.length === 0) {
                    user.premiumExpiresAt = null;
                    user.subscriptionPackage = null;
                    user.premiumAccess = false;
                    user.isPremium = false;
                    user.activePackage = [];
                }

                await user.save({ session });
            }
        }

        const setActivePackage = await Promise.all(
            user.activePackage.map(async (pkg) => {
                const packageId = pkg.packageId._id || pkg.packageId;
                const packageData = await PackageModel.findById(packageId)
                    .select("packageName")
                    .populate("categoryId", "name")
                    .session(session);

                return {
                    packageId: pkg.packageId,
                    activeDate: pkg.activeDate,
                    statusActive: pkg.statusActive,
                    pendingDate: pkg.pendingDate,
                    priority: pkg.priority,
                    categoryName: packageData ? packageData.categoryId.name : "Unknown Category",
                };
            })
        );

        const subscriptionPackageUser = await PackageModel.findById(user.subscriptionPackage)
            .select("packageName")
            .session(session);

        const response = {
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            status: user.status,
            isPremium: user.isPremium,
            emailVerified: user.emailVerified,
            premiumAccess: user.premiumAccess,
            premiumExpiresAt: user.premiumExpiresAt,
            currentSessionToken: user.currentSessionToken,
            subscriptionPackage: subscriptionPackageUser,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            __v: user.__v,
            isAfiliator: user.isAfiliator,
            codeAfiliator: user.codeAfiliator,
            afiliatedBy: user.afiliatedBy,
            reason: user.reason,
            nomor: user.nomor,
            activePackage: setActivePackage,
        };

        await session.commitTransaction();
        session.endSession();

        res.status(200).json(response);
    } catch (err) {
        console.log(err);
        await session.abortTransaction();
        errorLogs(req, res, err, "controllers/userControllers/profileUser.js");
        res.status(500).send("Server Error");
    } finally {
        session.endSession();
    }
};
