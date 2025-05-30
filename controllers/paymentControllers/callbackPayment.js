// controllers/paymentControllers/callbackPayment.js
const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const VoucherModel = require("../../models/voucerModel"); // Pastikan nama model konsisten
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog"); // Pastikan path ini benar
const polarService = require("../../services/polarService");
require("dotenv").config();


// Handler untuk webhook Polar.sh
exports.polarWebhook = async (req, res) => {
    console.log("[Polar Webhook] Received an event from Polar.");
    
    const signatureHeader = req.headers['polar-signature'] || req.headers['x-polar-signature']; // Header bisa bervariasi
    let rawBody = req.body; // Ini harusnya raw body (Buffer atau string)

    // Jika menggunakan express.raw(), req.body sudah Buffer/string.
    // Jika tidak, dan body sudah di-parse oleh express.json(), Anda perlu cara lain untuk mendapatkan raw body.
    // Asumsikan rawBody sudah benar.

    try {
        // Verifikasi signature webhook
        const validatedEvent = polarService.verifyWebhookSignature(rawBody, signatureHeader);
        if (!validatedEvent && process.env.NODE_ENV === 'production') { // Lebih ketat di produksi
            console.warn("[Polar Webhook] Invalid webhook signature. Request will be ignored.");
            return res.status(403).json({ message: "Invalid signature or secret not configured for production." });
        }
        if (!validatedEvent && process.env.NODE_ENV !== 'production' && !process.env.POLAR_WEBHOOK_SECRET) {
            console.warn("[Polar Webhook] Signature not verified (secret not set, non-production). Processing for testing.");
        } else if (!validatedEvent) {
             console.warn("[Polar Webhook] Invalid webhook signature (secret IS set or in production). Request will be ignored.");
            return res.status(403).json({ message: "Invalid signature." });
        }
        
        // Jika validatedEvent adalah object event dari SDK (setelah parse & validasi)
        const eventType = validatedEvent.type;
        const eventData = validatedEvent.data; // atau validatedEvent.data.object tergantung struktur dari Polar SDK
        
        console.log(`[Polar Webhook] Signature VERIFIED. Event Type: ${eventType}, Data ID: ${eventData?.id || 'N/A'}`);

        // Respon cepat ke Polar bahwa webhook diterima sebelum pemrosesan panjang
        res.status(202).json({ received: true, message: "Webhook received, processing started." });

        // Pemrosesan event secara asinkron (idealnya, ini akan di-offload ke queue/worker)
        // Untuk sekarang, kita proses langsung tapi setelah mengirim respons 202.
        processWebhookEvent(eventType, eventData, req).catch(processingError => {
            console.error("[Polar Webhook] ❌ Asynchronous processing error after 202 response:", processingError);
            // Log error ini secara internal, Polar sudah menerima 202.
            errorLogs(req, null, processingError.message, "controllers/paymentControllers/callbackPayment.js - processWebhookEvent Async");
        });

    } catch (error) { // Error pada level penerimaan webhook (misal, parsing body jika tidak raw)
        console.error("[Polar Webhook] ❌ Error handling webhook request (outer level):", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/callbackPayment.js - Outer Catch");
        // Jangan kirim 400 jika sudah mengirim 202. Jika error sebelum 202:
        if (!res.headersSent) {
            res.status(400).json({ message: "Webhook error: Invalid payload or signature issue." });
        }
    }
};

async function processWebhookEvent(eventType, eventData, req) {
    const session = await mongoose.startSession();
    session.startTransaction();
    let paymentReferenceId = null;
    let orderIdForLog = null;
    let isSuccessEvent = false;

    try {
        console.log(`[ProcessWebhook] Starting to process event: ${eventType}`);
        switch (eventType) {
            case 'checkout.session.completed': // Event dari Polar SDK/API v2 mungkin berbeda
            case 'checkout_session.completed': // Jaga-jaga jika ada variasi nama
                paymentReferenceId = eventData.id; // ID Checkout Session
                orderIdForLog = eventData.order_id || eventData.id;
                isSuccessEvent = (eventData.status === 'complete' && eventData.payment_status === 'paid');
                if (isSuccessEvent) {
                    await handleSuccessfulPayment(eventData, eventType, session, req, orderIdForLog);
                } else {
                    console.log(`[ProcessWebhook] Checkout session ${paymentReferenceId} completed but not marked as paid. Status: ${eventData.status}, Payment Status: ${eventData.payment_status}`);
                    await handleFailedOrPendingPayment(eventData, eventType, session, 'pending_confirmation'); // Atau status lain yang sesuai
                }
                break;

            case 'order.succeeded': // Event jika order berhasil (mungkin termasuk pembayaran)
            case 'order.paid':
                paymentReferenceId = eventData.checkout_session_id || eventData.checkout_id || eventData.metadata?.polar_checkout_id; // Cari checkout_id dari order
                orderIdForLog = eventData.id; // ID Order
                if (!paymentReferenceId && eventData.metadata?.internal_invoice) {
                    // coba cari payment berdasarkan invoice jika checkout_id tidak ada
                    const tempPayment = await PaymentModel.findOne({invoice: eventData.metadata.internal_invoice});
                    if(tempPayment) paymentReferenceId = tempPayment.polar_checkout_id;
                }
                 if (!paymentReferenceId) {
                    console.warn(`[ProcessWebhook] Could not determine checkout_session_id for order.paid event ${orderIdForLog}. Metadata:`, eventData.metadata);
                    // Jika tidak ada checkout_id, mungkin perlu logika lain untuk mencari payment lokal
                    // misalnya berdasarkan metadata.payment_id_internal jika Anda menyimpannya.
                    // Untuk sekarang, kita log dan skip jika tidak ada referensi jelas.
                    throw new Error(`Missing checkout reference for order.paid event: ${orderIdForLog}`);
                }
                await handleSuccessfulPayment(eventData, eventType, session, req, orderIdForLog, paymentReferenceId);
                break;
            
            // Handle langganan
            case 'subscription.created':
            case 'subscription.updated':
                // Untuk langganan, pembayaran mungkin ditangani oleh invoice.paid atau charge.succeeded
                // Kita perlu memastikan apakah event ini berarti pembayaran berhasil.
                // Biasanya, `status: 'active'` dan ada `latest_invoice` yang `paid`.
                paymentReferenceId = eventData.metadata?.polar_checkout_id || eventData.checkout_id; // Cari checkout_id dari metadata langganan
                orderIdForLog = eventData.id; // Subscription ID

                if (eventData.status === 'active' && (eventData.latest_invoice?.paid || eventData.latest_invoice?.status === 'paid')) {
                    console.log(`[ProcessWebhook] Active subscription event: ${eventType}, ID: ${orderIdForLog}. Assuming payment successful.`);
                     if (!paymentReferenceId && eventData.metadata?.internal_invoice) {
                        const tempPayment = await PaymentModel.findOne({invoice: eventData.metadata.internal_invoice});
                        if(tempPayment) paymentReferenceId = tempPayment.polar_checkout_id;
                    }
                    if (!paymentReferenceId) {
                        console.warn(`[ProcessWebhook] Could not determine checkout_session_id for subscription event ${orderIdForLog}.`);
                        // Coba cari payment record berdasarkan metadata jika ada (misal, user_id dan package_id dari checkout awal)
                        // Ini lebih kompleks dan mungkin perlu disimpan saat checkout awal jika langganan dibuat langsung.
                        // Untuk saat ini, jika tidak ada ref checkout, kita tidak bisa update payment record spesifik.
                        // Namun, kita tetap bisa mengupdate status langganan user jika `external_id` customer ada.
                        const userToUpdate = await UserModel.findOne({ polarCustomerId: eventData.customer_id });
                        if(userToUpdate) {
                            // Logika update langganan user langsung tanpa payment record (jika perlu)
                            console.log(`[ProcessWebhook] Updating user ${userToUpdate._id} subscription status directly from subscription event.`);
                            // (Tambahkan logika update user subscription di sini jika dibutuhkan)
                        } else {
                             throw new Error(`Missing checkout reference and user for subscription event: ${orderIdForLog}`);
                        }
                    } else {
                        await handleSuccessfulPayment(eventData, eventType, session, req, orderIdForLog, paymentReferenceId);
                    }
                } else {
                    console.log(`[ProcessWebhook] Subscription event ${eventType} for ${orderIdForLog} received, but not clearly indicating a successful payment (Status: ${eventData.status}, Latest Invoice: ${eventData.latest_invoice?.status}).`);
                }
                break;

            case 'checkout.session.expired':
            case 'checkout_session.expired':
                paymentReferenceId = eventData.id;
                orderIdForLog = eventData.id;
                await handleFailedOrPendingPayment(eventData, eventType, session, 'expired');
                break;
            
            case 'order.payment_failed':
                paymentReferenceId = eventData.checkout_session_id || eventData.checkout_id || eventData.metadata?.polar_checkout_id;
                orderIdForLog = eventData.id;
                 if (!paymentReferenceId && eventData.metadata?.internal_invoice) {
                    const tempPayment = await PaymentModel.findOne({invoice: eventData.metadata.internal_invoice});
                    if(tempPayment) paymentReferenceId = tempPayment.polar_checkout_id;
                }
                await handleFailedOrPendingPayment(eventData, eventType, session, 'failed');
                break;

            default:
                console.log(`[ProcessWebhook] Unhandled event type: ${eventType}. Data:`, JSON.stringify(eventData, null, 2));
        }

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        console.error(`[ProcessWebhook] ❌ Error processing event ${eventType} (Ref: ${paymentReferenceId || orderIdForLog}):`, error);
        errorLogs(req, null, `Webhook processing error for event ${eventType}: ${error.message}`, "controllers/paymentControllers/callbackPayment.js - processWebhookEvent");
        // Tidak re-throw agar tidak mengganggu respons 202 yang sudah dikirim
    } finally {
        session.endSession();
        console.log(`[ProcessWebhook] Finished processing event: ${eventType}`);
    }
}


async function handleSuccessfulPayment(eventData, eventType, session, req, orderOrSubId, checkoutSessionIdForLookup = null) {
    // `checkoutSessionIdForLookup` digunakan jika event type bukan checkout.session.completed
    // tapi kita punya ID checkout dari metadata order/subscription.
    const paymentLookupId = checkoutSessionIdForLookup || eventData.id; // ID untuk mencari PaymentModel

    console.log(`[WebhookSuccess] Processing successful payment. Event: ${eventType}, Polar Order/Sub ID: ${orderOrSubId}, PaymentLookupRef (CheckoutSessionID): ${paymentLookupId}`);

    const payment = await PaymentModel.findOne({
        polar_checkout_id: paymentLookupId 
    }).session(session);

    if (!payment) {
        console.warn(`[WebhookSuccess] Payment record not found for Polar Checkout ID: ${paymentLookupId}. Event: ${eventType}, Polar Order/Sub ID: ${orderOrSubId}`);
        // Jika metadata eventData memiliki user_id_internal atau package_id_internal, kita bisa coba cari atau log.
        if (eventData.metadata?.user_id_internal && eventData.metadata?.package_id_internal) {
            console.log(`[WebhookSuccess] Event metadata contains internal IDs: User ${eventData.metadata.user_id_internal}, Package ${eventData.metadata.package_id_internal}. A manual check might be needed if no payment record is found via checkout_id.`);
        }
        // Pertimbangkan apakah ini error yang harus menghentikan transaksi atau cukup log.
        // Jika ini adalah langganan yang diperpanjang otomatis, mungkin tidak ada checkout_id baru.
        // Dalam kasus itu, Anda perlu mencari berdasarkan subscription_id.
        if (eventType.startsWith('subscription.') && eventData.id) {
            const subPayment = await PaymentModel.findOne({ polar_subscription_id: eventData.id, payment_status: {$ne: 'paid'} }).sort({createdAt: -1}).session(session);
            if(subPayment){
                console.log(`[WebhookSuccess] Found existing payment record ${subPayment._id} via subscription ID ${eventData.id} for renewal.`);
                // Lanjutkan dengan subPayment
            } else {
                 console.warn(`[WebhookSuccess] No pending payment record found for subscription renewal ID: ${eventData.id}. This might be a new subscription or an issue.`);
                 // Jika ini subscription.created, mungkin perlu membuat payment record baru? Atau pastikan payment record dibuat saat checkout awal.
                 // Untuk sekarang, kita return jika tidak ada payment record terkait.
                 return;
            }
        } else {
            return; // Atau throw error jika payment record wajib ada.
        }
    }


    if (payment.payment_status === 'paid') {
        console.log(`[WebhookSuccess] Payment ${payment._id} (Polar Checkout ID: ${paymentLookupId}) already marked as paid. Skipping to avoid double processing. Event: ${eventType}`);
        return;
    }

    payment.payment_status = 'paid';
    payment.updatedBy = 'webhook';
    
    // Update dengan detail dari event Polar
    if (eventType.includes('order') && eventData.id) {
        payment.polar_order_id = eventData.id;
    } else if (eventData.order_id) { // Dari checkout_session.completed
        payment.polar_order_id = eventData.order_id;
    }
    if (eventType.startsWith('subscription') && eventData.id) {
        payment.polar_subscription_id = eventData.id;
    } else if (eventData.subscription_id) { // Dari checkout_session.completed jika menghasilkan langganan
        payment.polar_subscription_id = eventData.subscription_id;
    }
    // Simpan customer ID Polar dari event jika ada
    if(eventData.customer_id) payment.polar_customer_id = eventData.customer_id;


    // Update metadata payment dengan detail event webhook
    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData; // Simpan seluruh data event
    payment.polar_metadata.webhook_processed_at = new Date().toISOString();
    
    // Pastikan payment_time diisi jika belum (walaupun default-nya Date.now saat create)
    if (!payment.payment_time) payment.payment_time = new Date();


    await payment.save({ session });
    console.log(`[WebhookSuccess] Payment ${payment._id} status updated to 'paid'.`);

    // Increment voucher usage
    if (payment.voucher_id) {
        const voucher = await VoucherModel.findById(payment.voucher_id).session(session);
        if (voucher) {
            voucher.timesUsed = (voucher.timesUsed || 0) + 1;
            await voucher.save({ session });
            console.log(`[WebhookSuccess] Voucher ${voucher.code} (ID: ${voucher._id}) timesUsed incremented to ${voucher.timesUsed}.`);
        } else {
            console.warn(`[WebhookSuccess] Voucher with ID ${payment.voucher_id} not found for payment ${payment._id}.`);
        }
    }

    const [user, packageDetails] = await Promise.all([
        UserModel.findById(payment.userId).session(session),
        PackageModel.findById(payment.package_id).session(session)
    ]);

    if (!user || !packageDetails) {
        console.error(`[WebhookSuccess] CRITICAL: User (ID: ${payment.userId}) or Package (ID: ${payment.package_id}) not found for payment: ${payment._id}. This should not happen.`);
        throw new Error("User or Package not found during successful webhook processing.");
    }

    // Logika aktivasi/perpanjangan langganan pengguna
    // (Menggunakan logika yang sudah ada dari updatePayment.js, disederhanakan dan disesuaikan)
    const currentDate = new Date();
    let newExpiryDateForThisPackage = new Date(currentDate);
    newExpiryDateForThisPackage.setDate(currentDate.getDate() + packageDetails.durationInDays);

    const newActivePackageEntry = {
        packageId: packageDetails._id,
        activeDate: newExpiryDateForThisPackage, // Tanggal kedaluwarsa untuk *entri paket ini*
        priority: packageDetails.priority,
        statusActive: true,
        pendingDate: 0,
    };

    let existingPackageIndex = -1;
    if (user.activePackage && user.activePackage.length > 0) {
        existingPackageIndex = user.activePackage.findIndex(
            pkg => pkg.packageId && pkg.packageId.equals(packageDetails._id)
        );
    } else {
        user.activePackage = [];
    }
    

    if (existingPackageIndex !== -1) {
        // Paket yang sama sudah ada, perpanjang durasinya
        const currentActiveDate = user.activePackage[existingPackageIndex].activeDate;
        let baseDateForExtension = (currentActiveDate && new Date(currentActiveDate) > currentDate) ? new Date(currentActiveDate) : new Date(currentDate);
        
        const extendedExpiredTime = new Date(baseDateForExtension);
        extendedExpiredTime.setDate(baseDateForExtension.getDate() + packageDetails.durationInDays);
        
        user.activePackage[existingPackageIndex].activeDate = extendedExpiredTime;
        user.activePackage[existingPackageIndex].statusActive = true;
        user.activePackage[existingPackageIndex].pendingDate = 0; // Reset pending jika diaktifkan/diperpanjang
        newExpiryDateForThisPackage = extendedExpiredTime; // Update tanggal kedaluwarsa utama
        console.log(`[WebhookSuccess] Extended existing package ${packageDetails.packageName} for user ${user.username}. New expiry: ${newExpiryDateForThisPackage}`);
    } else {
        // Paket baru, tambahkan ke array
        user.activePackage.push(newActivePackageEntry);
        console.log(`[WebhookSuccess] Added new package ${packageDetails.packageName} to user ${user.username}.`);
    }

    // Sortir paket aktif berdasarkan prioritas (tertinggi dulu), lalu berdasarkan tanggal aktif (terbaru dulu)
    user.activePackage.sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        return (new Date(b.activeDate)).getTime() - (new Date(a.activeDate)).getTime();
    });

    // Tentukan paket utama yang aktif dan tanggal kedaluwarsa premium
    let topActivePackage = null;
    for (const pkg of user.activePackage) {
        if (pkg.statusActive && new Date(pkg.activeDate) > currentDate) {
            if (!topActivePackage || pkg.priority > topActivePackage.priority || (pkg.priority === topActivePackage.priority && new Date(pkg.activeDate) > new Date(topActivePackage.activeDate))) {
                topActivePackage = pkg;
            }
        }
    }

    if (topActivePackage) {
        user.isPremium = true;
        user.premiumAccess = true;
        user.subscriptionPackage = topActivePackage.packageId;
        user.premiumExpiresAt = topActivePackage.activeDate;
        console.log(`[WebhookSuccess] User ${user.username} premium access set. Package: ${topActivePackage.packageId}, Expires: ${topActivePackage.activeDate}`);
    } else {
        user.isPremium = false;
        user.premiumAccess = false;
        user.subscriptionPackage = null;
        user.premiumExpiresAt = null;
        console.log(`[WebhookSuccess] User ${user.username} has no current top active package. Premium access removed.`);
    }
    
    // Pastikan polarCustomerId di user model terisi jika ada dari event
    if (eventData.customer_id && !user.polarCustomerId) {
        user.polarCustomerId = eventData.customer_id;
    }

    await user.save({ session });
    console.log(`[WebhookSuccess] User ${user.username} (ID: ${user._id}) subscription details updated successfully.`);

    try {
        await createLogAction(
            user._id,
            `payment_success:${eventType}`,
            req?.ip || "webhook_polar",
            `Polar Event - Order/Sub ID: ${orderOrSubId}, Checkout ID: ${paymentLookupId}`
        );
    } catch (logError) {
        console.error("[WebhookSuccess] Error creating log action for successful payment:", logError);
    }
}

async function handleFailedOrPendingPayment(eventData, eventType, session, targetStatus) {
    const paymentLookupId = eventType.startsWith('checkout') ? eventData.id : (eventData.checkout_session_id || eventData.checkout_id || eventData.metadata?.polar_checkout_id);

    if (!paymentLookupId) {
        console.warn(`[WebhookFailOrPending] No valid payment reference ID found in eventData for event ${eventType}. Data:`, eventData);
        return;
    }
    
    console.log(`[WebhookFailOrPending] Processing ${targetStatus} payment. Event: ${eventType}, CheckoutRef ID: ${paymentLookupId}`);

    const payment = await PaymentModel.findOne({
        polar_checkout_id: paymentLookupId,
        payment_status: 'pending' // Hanya update jika masih pending
    }).session(session);

    if (!payment) {
        console.warn(`[WebhookFailOrPending] Pending payment record not found for Polar Checkout ID: ${paymentLookupId}, or already processed for event ${eventType}.`);
        return;
    }

    payment.payment_status = targetStatus; // 'expired', 'failed', 'pending_confirmation'
    payment.updatedBy = 'webhook';
    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData;
    payment.polar_metadata.webhook_processed_at = new Date().toISOString();
    if(eventData.customer_id && !payment.polar_customer_id) payment.polar_customer_id = eventData.customer_id;

    await payment.save({ session });

    console.log(`[WebhookFailOrPending] Payment ${payment._id} status updated to '${payment.payment_status}' for event ${eventType}.`);
}


// Legacy callback handler (Tripay) - bisa dipertahankan jika masih ada penggunaan
exports.paymentCallBack = async (req, res) => {
    console.log("[Legacy Tripay Callback] Received. System primarily uses Polar.sh webhooks.");
    // Implementasikan logika Tripay di sini jika masih relevan.
    // Jika tidak, cukup log dan kembalikan respons.
    return res.status(200).json({
        success: true,
        message: "Legacy Tripay callback received. No action taken by default as Polar.sh is primary."
    });
};