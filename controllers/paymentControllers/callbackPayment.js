// controllers/paymentControllers/callbackPayment.js

const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog");
const polarService = require("../../services/polarService");
require("dotenv").config();

// Polar webhook handler
exports.polarWebhook = async (req, res) => {
    try {
        // Verify webhook signature - optional for testing but recommended for production
        const signature = req.headers['x-polar-signature'] || req.headers['polar-signature'];
        
        if (!signature) {
            console.log("No webhook signature provided - for testing only");
            // For development, you might want to continue without signature
            // In production, uncomment the following line
            // return res.status(401).json({ message: "Signature missing" });
        } else {
            // Verify signature if provided
            const isValid = polarService.verifyWebhookSignature(req.body, signature);
            if (!isValid) {
                console.log("Invalid webhook signature");
                return res.status(401).json({ message: "Invalid signature" });
            }
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { event, data } = req.body;
            console.log(`[POLAR WEBHOOK] Event: ${event}, Data ID: ${data?.id || 'unknown'}`);

            // Handle different webhook events
            switch (event) {
                case 'checkout.created':
                    // Checkout session created - usually no action needed
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({ received: true });

                case 'checkout.updated':
                case 'order.created':
                    // Payment completed successfully
                    await handleSuccessfulPayment(data, session, req);
                    break;

                case 'checkout.failed':
                case 'checkout.expired':
                    // Payment failed or expired
                    await handleFailedPayment(data, session, event);
                    break;

                default:
                    console.log(`[POLAR WEBHOOK] Unhandled event: ${event}`);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({ received: true });
            }

            await session.commitTransaction();
            session.endSession();
            return res.status(200).json({ received: true });
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error; // Rethrow for the outer try-catch
        }
    } catch (error) {
        console.error("[POLAR WEBHOOK ERROR]", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/callbackPayment.js");
        
        // Always return 200 to Polar even for errors
        // This prevents Polar from retrying the webhook which might cause duplicate processing
        return res.status(200).json({
            received: true,
            error: "An error occurred processing the webhook, but we've logged it"
        });
    }
};

async function handleSuccessfulPayment(checkoutData, session, req) {
    // Find payment in database using checkout ID
    const payment = await PaymentModel.findOne({ 
        polar_checkout_id: checkoutData.id 
    }).session(session);

    if (!payment) {
        console.log(`Payment not found for checkout ID: ${checkoutData.id}`);
        return; // Return without error for webhook
    }

    // Update payment status
    payment.payment_status = 'paid';
    payment.updatedBy = 'webhook';
    payment.polar_order_id = checkoutData.order?.id || null;
    payment.polar_subscription_id = checkoutData.subscription?.id || null;
    payment.polar_metadata = { ...payment.polar_metadata, ...checkoutData };
    await payment.save({ session });

    // Get user and package information
    const [user, package] = await Promise.all([
        UserModel.findById(payment.userId).session(session),
        PackageModel.findById(payment.package_id).session(session)
    ]);

    if (!user || !package) {
        console.log("User or package not found for payment:", payment._id);
        return; // Return without error for webhook
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
                "Polar Webhook"
            );
        } catch (logError) {
            console.error("Error creating log:", logError);
        }
        
        console.log(`[POLAR WEBHOOK] New subscription activated for user ${user._id}`);
        return;
    }

    // Handle existing packages
    const existingIndex = user.activePackage.findIndex(
        item => {
            if (!item.packageId) return false;
            
            const pkgId = item.packageId;
            const targetId = package._id.toString();
            
            return (
                (typeof pkgId === 'string' && pkgId === targetId) || 
                (pkgId._id && pkgId._id.toString() === targetId)
            );
        }
    );

    // Extend current package if it's the same
    if (existingIndex === 0) {
        const activeDateSame = user.activePackage[existingIndex].activeDate;
        if (activeDateSame) {
            const extendedExpiredTime = new Date(activeDateSame);
            extendedExpiredTime.setDate(extendedExpiredTime.getDate() + package.durationInDays);
            user.activePackage[existingIndex].activeDate = extendedExpiredTime;
            user.premiumExpiresAt = extendedExpiredTime;
            await user.save({ session });
            
            try {
                await createLogAction(
                    user._id, 
                    "subscription_extended", 
                    req.ip || "0.0.0.0", 
                    "Polar Webhook"
                );
            } catch (logError) {
                console.error("Error creating log:", logError);
            }
            
            console.log(`[POLAR WEBHOOK] Subscription extended for user ${user._id}`);
            return;
        }
    }

    // Handle lower priority package
    if (existingIndex !== -1) {
        user.activePackage[existingIndex].pendingDate += package.durationInDays;
        user.activePackage[existingIndex].statusActive = false;
        user.activePackage.sort((a, b) => b.priority - a.priority);
        await user.save({ session });
        
        console.log(`[POLAR WEBHOOK] Pending days added for user ${user._id}`);
        return;
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
        const index = user.activePackage.findIndex(pkg => {
            if (!pkg.packageId) return false;
            
            const pkgId = pkg.packageId;
            const targetId = package._id.toString();
            
            return (
                (typeof pkgId === 'string' && pkgId === targetId) || 
                (pkgId._id && pkgId._id.toString() === targetId)
            );
        });
        
        if (index !== -1) {
            user.activePackage[index].pendingDate = package.durationInDays;
            user.activePackage[index].statusActive = false;
            user.activePackage[index].activeDate = null;
        }
    }
    
    user.activePackage.sort((a, b) => b.priority - a.priority);
    await user.save({ session });
    
    // Log the action
    try {
        await createLogAction(
            user._id, 
            "subscription_changed", 
            req.ip || "0.0.0.0", 
            "Polar Webhook"
        );
    } catch (logError) {
        console.error("Error creating log:", logError);
    }
    
    console.log(`[POLAR WEBHOOK] Subscription updated for user ${user._id}`);
}

async function handleFailedPayment(checkoutData, session, event) {
    // Find payment in database using checkout ID
    const payment = await PaymentModel.findOne({ 
        polar_checkout_id: checkoutData.id 
    }).session(session);

    if (!payment) {
        console.log(`Payment not found for checkout ID: ${checkoutData.id}`);
        return;
    }

    // Update payment status based on event
    const statusMap = {
        'checkout.failed': 'decline',
        'checkout.expired': 'expired'
    };

    payment.payment_status = statusMap[event] || 'decline';
    payment.updatedBy = 'webhook';
    payment.polar_metadata = { ...payment.polar_metadata, ...checkoutData };
    await payment.save({ session });

    console.log(`[POLAR WEBHOOK] Payment ${payment.payment_status} for checkout ${checkoutData.id}`);
}

// Legacy callback handler - keep for backward compatibility
exports.paymentCallBack = async (req, res) => {
    console.log("[LEGACY CALLBACK] Tripay callback received, but system now uses Polar");
    return res.status(200).json({ 
        message: "System now uses Polar webhooks. Please update your integration." 
    });
};