// controllers/paymentControllers/callbackPayment.js

const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const VoucherModel = require("../../models/voucerModel"); // Tambahkan VoucherModel
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog");
const polarService = require("../../services/polarService");
require("dotenv").config();

// Polar webhook handler
exports.polarWebhook = async (req, res) => {
    try {
        console.log("[Polar Webhook] Received event.");
        // Log raw body for signature debugging if needed, but be careful with sensitive data in production logs
        // console.log("[Polar Webhook] Raw body:", req.body); // Jika req.body adalah object, JSON.stringify(req.body)
        
        const signature = req.headers['x-polar-signature'] || req.headers['polar-signature'];
        
        if (!signature && process.env.NODE_ENV === 'production') { // Lebih ketat di produksi
            console.warn("[Polar Webhook] Signature missing in production environment.");
            return res.status(401).json({ message: "Signature missing" });
        }
        
        // Di environment non-produksi, kita mungkin ingin mengizinkan tanpa signature untuk testing
        if (signature || process.env.NODE_ENV === 'production') { // Selalu verifikasi jika signature ada atau jika di produksi
            const isValid = polarService.verifyWebhookSignature(req.body, signature);
            if (!isValid) {
                console.warn("[Polar Webhook] Invalid webhook signature.");
                return res.status(401).json({ message: "Invalid signature" });
            }
             console.log("[Polar Webhook] Signature verified successfully.");
        } else {
            console.warn("[Polar Webhook] Skipping signature verification (NODE_ENV is not production and no signature provided).");
        }


        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const { type: eventType, data } = req.body; // Polar menggunakan 'type' untuk event
            console.log(`[Polar Webhook] Event Type: ${eventType}, Data ID: ${data?.id || 'unknown'}`);

            switch (eventType) {
                case 'checkout_session.completed': // Atau event yang sesuai dari Polar untuk pembayaran sukses
                case 'order.paid': // Event lain yang mungkin dari Polar
                case 'subscription.created': // Jika langganan dibuat
                case 'subscription.updated': // Jika langganan diperbarui (misal, pembayaran berhasil)
                    await handleSuccessfulPayment(data, eventType, session, req);
                    break;

                case 'checkout_session.expired':
                case 'order.payment_failed':
                    await handleFailedPayment(data, eventType, session);
                    break;

                default:
                    console.log(`[Polar Webhook] Unhandled event type: ${eventType}`);
            }

            await session.commitTransaction();
            session.endSession();
            return res.status(200).json({ received: true, message: "Webhook processed." });
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error("[Polar Webhook] ❌ Error processing webhook event:", error);
            // Tetap kembalikan 200 agar Polar tidak mencoba mengirim ulang terus-menerus
            // Error sudah dicatat di server.
            return res.status(200).json({ 
                received: true, 
                error: "Internal server error during webhook processing.",
                errorMessage: error.message 
            });
        }
    } catch (outerError) { // Error sebelum transaksi dimulai (misal: JSON parsing)
        console.error("[Polar Webhook] ❌ Outer error processing webhook:", outerError);
        errorLogs(req, res, outerError.message, "controllers/paymentControllers/callbackPayment.js - Outer Catch");
        return res.status(400).json({ message: "Invalid webhook payload or server error." });
    }
};

async function handleSuccessfulPayment(eventData, eventType, session, req) {
    // Polar mengirim data order atau checkout session dalam `eventData`
    // Kita perlu mencari payment record kita berdasarkan referensi yang kita simpan
    // Misalnya, jika kita menyimpan polar_checkout_id saat membuat payment.
    
    let paymentReferenceId = null;
    let orderIdForLog = null;

    if (eventType === 'checkout_session.completed' && eventData.id) {
        paymentReferenceId = eventData.id; // ID dari checkout session
        orderIdForLog = eventData.order_id || eventData.id;
    } else if (eventType === 'order.paid' && eventData.id) {
        paymentReferenceId = eventData.checkout_id || eventData.id; // Bisa jadi checkout_id atau order_id tergantung struktur data Polar
        orderIdForLog = eventData.id;
    } else if ((eventType === 'subscription.created' || eventType === 'subscription.updated') && eventData.latest_invoice?.payment_intent?.id) {
        // Untuk langganan, mungkin perlu logika berbeda untuk mencari payment record
        // Asumsi kita punya cara untuk menghubungkan invoice/payment_intent ke payment record kita
        // Untuk contoh ini, kita asumsikan ada checkout_id di metadata subscription
        paymentReferenceId = eventData.metadata?.checkout_id || eventData.id;
        orderIdForLog = eventData.id; // Subscription ID
    } else {
        console.log(`[Webhook Success] Unclear payment reference from event type ${eventType} and data:`, eventData);
        return;
    }

    if (!paymentReferenceId) {
        console.log(`[Webhook Success] No valid payment reference ID found in eventData for event ${eventType}.`);
        return;
    }
    
    console.log(`[Webhook Success] Processing successful payment. Event: ${eventType}, Ref ID: ${paymentReferenceId}, Order/Data ID: ${orderIdForLog}`);

    const payment = await PaymentModel.findOne({
        polar_checkout_id: paymentReferenceId // Cari berdasarkan ID checkout Polar
    }).session(session);

    if (!payment) {
        console.warn(`[Webhook Success] Payment record not found for Polar checkout ID: ${paymentReferenceId}`);
        // Mungkin ini adalah pembayaran yang tidak diinisiasi oleh sistem kita atau sudah diproses
        return;
    }

    if (payment.payment_status === 'paid') {
        console.log(`[Webhook Success] Payment ${payment._id} (Polar Ref: ${paymentReferenceId}) already marked as paid. Skipping.`);
        return;
    }

    payment.payment_status = 'paid';
    payment.updatedBy = 'webhook';
    // Update dengan data order/subscription dari Polar jika ada
    payment.polar_order_id = eventData.order_id || (eventType === 'order.paid' ? eventData.id : payment.polar_order_id);
    payment.polar_subscription_id = eventData.subscription_id || (eventType.startsWith('subscription.') ? eventData.id : payment.polar_subscription_id);
    
    // Tambahkan lebih banyak detail dari eventData ke polar_metadata payment jika perlu
    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData; // Simpan semua data event
    
    await payment.save({ session });
    console.log(`[Webhook Success] Payment ${payment._id} status updated to 'paid'.`);

    // Increment voucher usage if a voucher was applied to this payment
    if (payment.voucher_id) {
        const voucher = await VoucherModel.findById(payment.voucher_id).session(session);
        if (voucher) {
            voucher.timesUsed = (voucher.timesUsed || 0) + 1;
            await voucher.save({ session });
            console.log(`[Webhook Success] Voucher ${voucher.code} (ID: ${voucher._id}) timesUsed incremented to ${voucher.timesUsed}.`);
        } else {
            console.warn(`[Webhook Success] Voucher with ID ${payment.voucher_id} not found for payment ${payment._id}.`);
        }
    }

    const [user, packageDetails] = await Promise.all([ // Ganti nama 'package' menjadi 'packageDetails'
        UserModel.findById(payment.userId).session(session),
        PackageModel.findById(payment.package_id).session(session)
    ]);

    if (!user || !packageDetails) {
        console.error(`[Webhook Success] User or package not found for payment: ${payment._id}. User: ${user?._id}, Package: ${packageDetails?._id}`);
        // Ini adalah error serius, mungkin perlu rollback atau notifikasi admin
        throw new Error("User or Package not found during webhook processing.");
    }

    const currentDate = new Date();
    let newExpiredTime = new Date(currentDate); // Mulai dari tanggal saat ini
    newExpiredTime.setDate(currentDate.getDate() + packageDetails.durationInDays);

    const newSubscriptionEntry = { // Ganti nama 'newPackage' menjadi 'newSubscriptionEntry'
        packageId: packageDetails._id,
        activeDate: newExpiredTime,
        priority: packageDetails.priority,
        statusActive: true,
        pendingDate: 0,
    };

    if (!Array.isArray(user.activePackage) || user.activePackage.length === 0) {
        user.activePackage = [newSubscriptionEntry];
    } else {
        // Logika penanganan paket aktif yang sudah ada
        // (Mempertahankan logika yang ada, namun pastikan perbandingan ObjectId aman)
        const existingPackageIndex = user.activePackage.findIndex(
            item => item.packageId && item.packageId.equals(packageDetails._id) // Perbandingan ObjectId yang aman
        );

        if (existingPackageIndex !== -1 && user.activePackage[existingPackageIndex].priority === packageDetails.priority) {
            // Paket yang sama, perpanjang
            const currentActiveDate = user.activePackage[existingPackageIndex].activeDate;
            let baseDateForExtension = new Date(); // Default ke hari ini jika tidak ada tanggal aktif atau sudah lewat

            if (currentActiveDate && new Date(currentActiveDate) > baseDateForExtension) {
                baseDateForExtension = new Date(currentActiveDate);
            }
            
            const extendedExpiredTime = new Date(baseDateForExtension);
            extendedExpiredTime.setDate(baseDateForExtension.getDate() + packageDetails.durationInDays);
            
            user.activePackage[existingPackageIndex].activeDate = extendedExpiredTime;
            user.activePackage[existingPackageIndex].statusActive = true; // Pastikan aktif
            newExpiredTime = extendedExpiredTime; // Update newExpiredTime untuk user.premiumExpiresAt
             console.log(`[Webhook Success] Extended existing package ${packageDetails.packageName} for user ${user._id}. New expiry: ${newExpiredTime}`);
        } else {
            // Paket baru atau paket dengan prioritas berbeda, tambahkan ke array
            // dan biarkan logika sorting dan penentuan premiumExpiresAt di bawah yang menanganinya.
             user.activePackage.push(newSubscriptionEntry);
             console.log(`[Webhook Success] Added new/different package ${packageDetails.packageName} for user ${user._id}.`);
        }
    }
    
    // Urutkan berdasarkan prioritas (tertinggi dulu), lalu berdasarkan tanggal aktif (terbaru dulu jika prioritas sama)
    user.activePackage.sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        // Jika prioritas sama, yang aktif duluan. Jika keduanya aktif/non-aktif, tanggal aktif menentukan.
        if (a.statusActive && !b.statusActive) return -1;
        if (!a.statusActive && b.statusActive) return 1;
        return (b.activeDate || 0) - (a.activeDate || 0); // Mungkin perlu perbaikan
    });

    // Non-aktifkan paket dengan prioritas lebih rendah jika ada paket dengan prioritas lebih tinggi yang baru aktif
    let topActivePackageFound = false;
    user.activePackage.forEach(pkg => {
        if (pkg.statusActive) {
            if (!topActivePackageFound) {
                user.premiumAccess = true;
                user.isPremium = true;
                user.subscriptionPackage = pkg.packageId;
                user.premiumExpiresAt = pkg.activeDate; // Ini adalah tanggal kedaluwarsa dari paket prioritas tertinggi yang aktif
                topActivePackageFound = true;
                 console.log(`[Webhook Success] Top active package for user ${user._id} is ${pkg.packageId} expiring at ${pkg.activeDate}`);
            } else {
                // Jika sudah ada paket aktif dengan prioritas lebih tinggi, paket ini (jika aktif) harus jadi pending
                // Logika ini mungkin perlu disempurnakan berdasarkan aturan bisnis yang lebih detail
                // Untuk saat ini, asumsikan sort sudah benar dan premiumExpiresAt di-set oleh yang pertama aktif.
            }
        }
    });

    if (!topActivePackageFound && user.activePackage.length > 0) {
        // Jika tidak ada paket aktif tapi masih ada paket di array (semua pending),
        // coba aktifkan yang paling atas (prioritas tertinggi)
        const firstPending = user.activePackage[0];
        firstPending.statusActive = true;
        firstPending.activeDate = new Date(currentDate.getTime() + (firstPending.pendingDate * 24 * 60 * 60 * 1000));
        firstPending.pendingDate = 0;

        user.premiumAccess = true;
        user.isPremium = true;
        user.subscriptionPackage = firstPending.packageId;
        user.premiumExpiresAt = firstPending.activeDate;
        console.log(`[Webhook Success] Activated first pending package ${firstPending.packageId} for user ${user._id}. Expires: ${firstPending.activeDate}`);
    } else if (!topActivePackageFound && user.activePackage.length === 0) {
        // Tidak ada paket aktif dan tidak ada paket pending
        user.premiumAccess = false;
        user.isPremium = false;
        user.subscriptionPackage = null;
        user.premiumExpiresAt = null;
        console.log(`[Webhook Success] User ${user._id} has no active or pending packages. Premium access removed.`);
    }


    await user.save({ session });
    console.log(`[Webhook Success] User ${user._id} subscription details updated.`);

    try {
        await createLogAction(
            user._id,
            `subscription_payment_success_${eventType.replace('.', '_')}`, // e.g., subscription_payment_success_checkout_session_completed
            req?.ip || "webhook", // Ambil IP dari req jika ada
            `Polar Webhook - Order/Data ID: ${orderIdForLog}`
        );
    } catch (logError) {
        console.error("[Webhook Success] Error creating log action:", logError);
    }
}

async function handleFailedPayment(eventData, eventType, session) {
    let paymentReferenceId = null;

    if (eventType === 'checkout_session.expired' && eventData.id) {
        paymentReferenceId = eventData.id;
    } else if (eventType === 'order.payment_failed' && eventData.id) {
        paymentReferenceId = eventData.checkout_id || eventData.id;
    } else {
        console.log(`[Webhook Failed] Unclear payment reference from event type ${eventType} and data:`, eventData);
        return;
    }

    if (!paymentReferenceId) {
        console.log(`[Webhook Failed] No valid payment reference ID found in eventData for event ${eventType}.`);
        return;
    }
    
    console.log(`[Webhook Failed] Processing failed/expired payment. Event: ${eventType}, Ref ID: ${paymentReferenceId}`);

    const payment = await PaymentModel.findOne({
        polar_checkout_id: paymentReferenceId,
        payment_status: 'pending' // Hanya update jika masih pending
    }).session(session);

    if (!payment) {
        console.warn(`[Webhook Failed] Pending payment record not found for Polar checkout ID: ${paymentReferenceId}, or already processed.`);
        return;
    }

    const statusMap = {
        'checkout_session.expired': 'expired',
        'order.payment_failed': 'decline' // atau 'failed'
    };

    payment.payment_status = statusMap[eventType] || 'decline';
    payment.updatedBy = 'webhook';
    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData;
    await payment.save({ session });

    console.log(`[Webhook Failed] Payment ${payment._id} status updated to '${payment.payment_status}'.`);
}

// Legacy callback handler
exports.paymentCallBack = async (req, res) => {
    console.log("[Legacy Callback] Tripay callback received, but system now uses Polar. This endpoint is for backward compatibility or specific Tripay integrations if any.");
    // Jika Anda masih menggunakan Tripay untuk beberapa hal, implementasikan logikanya di sini.
    // Jika tidak, cukup kembalikan respons bahwa ini tidak lagi digunakan.
    return res.status(200).json({
        success: true, // Tripay biasanya mengharapkan success:true
        message: "Legacy callback received. System primarily uses Polar webhooks. No action taken by default unless specific Tripay logic is implemented here."
    });
};