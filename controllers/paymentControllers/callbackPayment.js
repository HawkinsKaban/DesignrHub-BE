const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog");
require("dotenv").config();

exports.paymentCallBack = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Validate request
        const { reference, status } = req.body;
        
        if (!reference || !status) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Reference and status are required" });
        }

        // Find payment in database
        const payment = await PaymentModel.findOne({ reference }).session(session);
        if (!payment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Payment not found" });
        }

        // Log the callback for debugging
        console.log(`[PAYMENT CALLBACK] Reference: ${reference}, Status: ${status}, User: ${payment.userId}`);

        // Update payment status based on callback
        payment.payment_status = status.toLowerCase();
        payment.updatedBy = "callback";
        await payment.save({ session });

        // Process different payment statuses
        if (status.toLowerCase() === "paid") {
            // Get user and package information
            const [user, package] = await Promise.all([
                UserModel.findById(payment.userId).session(session),
                PackageModel.findById(payment.package_id).session(session)
            ]);

            if (!user || !package) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: "User or package not found" });
            }

            // Calculate new expiration date
            const currentDate = new Date();
            const newExpiredTime = new Date(currentDate);
            newExpiredTime.setDate(currentDate.getDate() + package.durationInDays);

            // Create new package subscription
            const newPackage = {
                packageId: package._id,
                activeDate: newExpiredTime,
                priority: package.priority,
                statusActive: true,
                pendingDate: 0,
            };

            // Handle case where user has no active packages
            if (!Array.isArray(user.activePackage) || user.activePackage.length === 0) {
                user.activePackage = [newPackage];
                user.premiumAccess = true;
                user.isPremium = true;
                user.subscriptionPackage = package._id;
                user.premiumExpiresAt = newExpiredTime;
                await user.save({ session });
                
                // Log the action
                try {
                    await createLogAction(
                        user._id, 
                        "subscription_activated", 
                        req.ip || "0.0.0.0", 
                        "Payment Callback"
                    );
                } catch (logError) {
                    console.error("Error creating log:", logError);
                }
                
                await session.commitTransaction();
                session.endSession();
                
                return res.status(200).json({
                    success: true,
                    message: "Payment successful: new subscription activated",
                });
            }

            // Handle existing packages
            const existingIndex = user.activePackage.findIndex(
                item => item.packageId.toString() === package._id.toString() ||
                       (item.packageId._id && item.packageId._id.toString() === package._id.toString())
            );

            // Extend current package if it's the same
            if (existingIndex === 0) {
                const activeDateSame = user.activePackage[existingIndex].activeDate;
                const extendedExpiredTime = new Date(activeDateSame);
                extendedExpiredTime.setDate(extendedExpiredTime.getDate() + package.durationInDays);
                user.activePackage[existingIndex].activeDate = extendedExpiredTime;
                user.premiumExpiresAt = extendedExpiredTime;
                await user.save({ session });
                
                // Log the action
                try {
                    await createLogAction(
                        user._id, 
                        "subscription_extended", 
                        req.ip || "0.0.0.0", 
                        "Payment Callback"
                    );
                } catch (logError) {
                    console.error("Error creating log:", logError);
                }
                
                await session.commitTransaction();
                session.endSession();
                
                return res.status(200).json({
                    success: true,
                    message: "Payment successful: subscription extended",
                });
            }

            // Handle lower priority package
            if (existingIndex !== -1) {
                user.activePackage[existingIndex].pendingDate += package.durationInDays;
                user.activePackage[existingIndex].statusActive = false;
                user.activePackage.sort((a, b) => b.priority - a.priority);
                await user.save({ session });
                
                await session.commitTransaction();
                session.endSession();
                
                return res.status(200).json({
                    success: true,
                    message: "Payment successful: pending days added",
                });
            }

            // Handle new package with different priority
            user.activePackage.push(newPackage);
            
            // If new package has higher priority, make it active
            const topPriorityPackage = user.activePackage[0];
            if (package.priority > topPriorityPackage.priority) {
                // Store remaining days of current package
                const gapDays = topPriorityPackage.activeDate
                    ? Math.ceil((topPriorityPackage.activeDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                
                if (gapDays > 0 && topPriorityPackage.statusActive) {
                    topPriorityPackage.activeDate = null;
                    topPriorityPackage.statusActive = false;
                    topPriorityPackage.pendingDate += gapDays;
                }
                
                user.premiumExpiresAt = newExpiredTime;
                user.subscriptionPackage = package._id;
            } else {
                // If new package has lower priority, add as pending
                const index = user.activePackage.findIndex(pkg => pkg.packageId.toString() === package._id.toString());
                user.activePackage[index].pendingDate = package.durationInDays;
                user.activePackage[index].statusActive = false;
                user.activePackage[index].activeDate = null;
            }
            
            user.activePackage.sort((a, b) => b.priority - a.priority);
            await user.save({ session });
            
            // Log the action
            try {
                await createLogAction(
                    user._id, 
                    "subscription_changed", 
                    req.ip || "0.0.0.0", 
                    "Payment Callback"
                );
            } catch (logError) {
                console.error("Error creating log:", logError);
            }
            
            await session.commitTransaction();
            session.endSession();
            
            return res.status(200).json({
                success: true,
                message: "Payment successful: subscription updated",
            });
        } else if (status.toLowerCase() === "expired" || status.toLowerCase() === "failed") {
            // Just update the payment status, no subscription changes
            await session.commitTransaction();
            session.endSession();
            
            return res.status(200).json({
                success: true,
                message: `Payment status updated to ${status.toLowerCase()}`,
            });
        }

        // For other statuses, just acknowledge
        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).json({
            success: true,
            message: `Payment status updated to ${status.toLowerCase()}`,
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        errorLogs(req, res, error.message, "controllers/paymentControllers/callbackPayment.js");
        console.error("[PAYMENT CALLBACK ERROR]", error);
        
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};