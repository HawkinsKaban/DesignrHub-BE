const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs")

exports.updateSubscriptionUser = async (req, res) => {
    try {
        const user = await UserModel.findById(req.params.id);
        // Pengecekan user segera setelah pencarian
        if (!user) {
            console.error(`[ERROR] User with ID ${req.params.id} not found`);
            return res.status(404).json({ message: "User not found" });
        }

        const { activePackage, premiumAccess } = req.body;

        if (premiumAccess === false || activePackage.length === 0) {
            user.premiumAccess = false;
            user.isPremium = false;
            user.premiumExpiresAt = null;
            user.subscriptionPackage = null;
            user.activePackage = [];
            await user.save();
            return res.json({
                message: "Update user menjadi non-premium berhasil",
            });
        }

        if (!Array.isArray(activePackage)) {
            return res.status(400).json({ message: "activePackage harus berupa array" });
        }
        activePackage.sort((a, b) => b.priority - a.priority);
        const mergedPackagesMap = new Map();
        activePackage.forEach(pkg => {
            if (mergedPackagesMap.has(pkg.priority)) {
                const existingPkg = mergedPackagesMap.get(pkg.priority);
                existingPkg.pendingDate += pkg.pendingDate;
            } else {
                mergedPackagesMap.set(pkg.priority, { ...pkg });
            }
        });
        const fixActivePackage = Array.from(mergedPackagesMap.values());
        if (
            user.premiumAccess === false &&
            user.activePackage.length === 0 &&
            !user.subscriptionPackage &&
            user.isPremium === false
        ) {
            const firstPackage = fixActivePackage[0];
            const msPerDay = 24 * 60 * 60 * 1000;
            const durationDate = new Date(Date.now() + firstPackage.pendingDate * msPerDay);
            firstPackage.activeDate = durationDate;
            firstPackage.pendingDate = 0;
            firstPackage.statusActive = true;

            user.premiumAccess = true;
            user.isPremium = true;
            user.premiumExpiresAt = durationDate;
            user.subscriptionPackage = firstPackage.packageId;
            user.activePackage = fixActivePackage;

            await user.save();
            return res.json({
                message: "Kondisi: User belum pernah memiliki package sebelumnya",
                user,
            });
        }

        user.activePackage = [];
        await user.save();

        const topPackage = fixActivePackage[0];
        const durationDate = new Date(Date.now() + topPackage.pendingDate * (1000 * 60 * 60 * 24));
        topPackage.activeDate = durationDate;
        topPackage.pendingDate = 0;
        topPackage.statusActive = true;

        user.activePackage = fixActivePackage;
        user.premiumExpiresAt = durationDate;
        user.subscriptionPackage = topPackage.packageId;
        user.isPremium = true;
        user.premiumAccess = true;

        await user.save();
        return res.json({
            message: "Update activePackage berhasil",
            user,
        });
    } catch (err) {
        errorLogs(req, res, err, "controllers/userControllers/updateSubscriptionUser.js");
        return res.status(500).send("Server Error");
    }
};
