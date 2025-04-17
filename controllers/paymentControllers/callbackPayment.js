const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");
require("dotenv").config();

exports.paymentCallBack = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { reference, status } = req.body;
        const payment = await PaymentModel.findOne({ reference }).session(session);
        if (!payment) {
            console.error(`[ERROR] User payment not found for reference: ${reference}`);
            await session.abortTransaction();
            return res.status(404).json({ message: "User payment not found!" });
        }

        const { userId, package_id } = payment;
        const [dataUser, package] = await Promise.all([
            UserModel.findById(userId).session(session),
            PackageModel.findById(package_id).session(session)
        ]);
        if (!dataUser || !package) {
            await session.abortTransaction();
            return res.status(404).json({ message: "User or package not found" });
        }


        const currentDate = new Date();

        if (Array.isArray(dataUser.activePackage) && dataUser.activePackage.length > 0) {
            const indexToRemove = dataUser.activePackage.findIndex((pkg, index) => index !== 0 && pkg.pendingDate === 0);
            if (indexToRemove > 0) {
                dataUser.activePackage.splice(indexToRemove, 1);
                await dataUser.save({ session });
            }
        }


        if (status.toLowerCase() === "paid" && payment.payment_status !== "paid") {
            payment.payment_status = "paid";
            payment.updatedBy = "callback";
            await payment.save({ session });

            let newExpiredTime = new Date(currentDate);
            newExpiredTime.setDate(currentDate.getDate() + package.durationInDays);

            const newPackage = {
                packageId: package._id,
                activeDate: newExpiredTime,
                priority: package.priority,
                statusActive: true,
                pendingDate: 0,
            };

            if (dataUser.activePackage.length === 0) {
                dataUser.activePackage.push(newPackage);
                dataUser.premiumAccess = true;
                dataUser.isPremium = true;
                dataUser.subscriptionPackage = package_id;
                dataUser.premiumExpiresAt = newExpiredTime;
                await dataUser.save({ session });
                await session.commitTransaction();
                return res.status(200).json({
                    success: true,
                    message: "Payment success: new package added as first active package",
                });
            }

            const existingIndex = dataUser.activePackage.findIndex(item => item.priority === package.priority);

            if (dataUser.isPremium && existingIndex === 0) {
                const activeDateSame = dataUser.activePackage[existingIndex].activeDate;
                const extendedExpiredTime = new Date(activeDateSame);
                extendedExpiredTime.setDate(extendedExpiredTime.getDate() + package.durationInDays);
                dataUser.activePackage[existingIndex].activeDate = extendedExpiredTime;
                dataUser.premiumExpiresAt = extendedExpiredTime;
                await dataUser.save({ session });
                await session.commitTransaction();
                return res.status(200).json({
                    success: true,
                    message: "Payment success: top-priority package extended",
                });
            }

            if (dataUser.isPremium && existingIndex !== 0 && existingIndex !== -1) {
                dataUser.activePackage[existingIndex].pendingDate += package.durationInDays;
                dataUser.activePackage[existingIndex].statusActive = false;
                dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                await dataUser.save({ session });
                await session.commitTransaction();
                return res.status(200).json({
                    success: true,
                    message: "Payment success: pending days added to existing package",
                });
            }

            if (dataUser.isPremium && existingIndex === -1) {
                const topPriorityPackage = dataUser.activePackage[0];
                if (topPriorityPackage.priority < package.priority) {
                    dataUser.activePackage.push(newPackage);
                    const gapDays = topPriorityPackage.activeDate
                        ? Math.ceil((topPriorityPackage.activeDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                    if (topPriorityPackage.statusActive) {
                        topPriorityPackage.activeDate = null;
                        topPriorityPackage.statusActive = false;
                        topPriorityPackage.pendingDate += (gapDays > 0 ? gapDays : 0);
                    }
                    dataUser.premiumExpiresAt = newExpiredTime;
                    dataUser.subscriptionPackage = package_id;
                    dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                    await dataUser.save({ session });
                    await session.commitTransaction();
                    return res.status(200).json({
                        success: true,
                        message: "Payment success: new top-priority package activated",
                    });
                } else {
                    newPackage.pendingDate = package.durationInDays;
                    newPackage.statusActive = false;
                    dataUser.activePackage.push(newPackage);
                    dataUser.activePackage.sort((a, b) => b.priority - a.priority);
                    await dataUser.save({ session });
                    await session.commitTransaction();
                    return res.status(200).json({
                        success: true,
                        message: "Payment success: lower-priority package added",
                    });
                }
            }


            dataUser.activePackage.sort((a, b) => b.priority - a.priority);
            await dataUser.save({ session });
            await session.commitTransaction();
            return res.status(200).json({
                success: true,
                message: "Payment success: active package updated",
            });
        } else if (status.toLowerCase() === "expired") {
            const updatedPayment = await PaymentModel.findByIdAndUpdate(
                payment._id,
                { payment_status: "expired" },
                { new: true, session }
            );
            await updatedPayment.save({ session });
            await session.commitTransaction();
            return res.status(200).json({ success: false });
        } else {
            console.warn(`[WARN] No action taken for payment status: ${status}`);
            await session.commitTransaction();
            return res.status(200).json({
                success: true,
                message: "Payment status updated successfully",
            });
        }
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/paymentControllers/callbackPayment.js");
        return res.status(500).json({ message: "Server error" });
    } finally {
        session.endSession();
    }
};
