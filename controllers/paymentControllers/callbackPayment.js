// controllers/paymentControllers/callbackPayment.js
const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const VoucherModel = require("../../models/voucerModel");
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog");
const polarService = require("../../services/polarService");
require("dotenv").config();


exports.polarWebhook = async (req, res) => {
    console.log("[Polar Webhook] Received an event from Polar.");
    
    const signatureHeader = req.headers['polar-signature'] || req.headers['x-polar-signature'];
    let rawBody = req.body; 

    try {
        const validatedEvent = polarService.verifyWebhookSignature(rawBody, signatureHeader);
        // verifyWebhookSignature sekarang mengembalikan event yang divalidasi atau false/error
        
        if (!validatedEvent) { // Jika validasi gagal
            if (process.env.NODE_ENV === 'production' || process.env.POLAR_WEBHOOK_SECRET) {
                 console.warn("[Polar Webhook] Invalid webhook signature. Request will be ignored.");
                 return res.status(403).json({ message: "Invalid signature." });
            } else {
                 // Jika di dev dan tidak ada secret, kita log warning tapi proses event (seperti logika di verifyWebhookSignature)
                 console.warn("[Polar Webhook] Signature not verified (secret not set, non-production). Processing for testing. Event assumed from raw body if parsing needed.");
                 // Jika rawBody adalah Buffer dan perlu di-parse ke JSON:
                 if (Buffer.isBuffer(rawBody)) {
                    try {
                        rawBody = JSON.parse(rawBody.toString('utf8'));
                    } catch (parseError) {
                        console.error("[Polar Webhook] Failed to parse raw body to JSON when secret is not set:", parseError);
                        return res.status(400).json({ message: "Invalid JSON payload." });
                    }
                 }
                 // Jika rawBody sudah objek (misal karena middleware global express.json()), ini mungkin sudah OK.
                 // Asumsikan 'validatedEvent' bisa jadi rawBody jika verifikasi diskip.
                 // Namun, fungsi verifyWebhookSignature yang baik harusnya melempar error atau return object eventnya.
                 // Berdasarkan update di polarService, `validateEvent` dari SDK akan return event object atau throw error.
                 // Jadi, jika `validatedEvent` adalah `true` dari logika lama kita (secret tidak diset & non-prod),
                 // kita perlu ambil event dari body.
                 // Sebaiknya, `polarService.verifyWebhookSignature` konsisten mengembalikan event object atau throw error.
                 // Mari kita asumsikan `validatedEvent` adalah objek event jika berhasil, atau false/error jika gagal.
                 // Jika `validatedEvent` adalah `true` (kasus skip di dev), maka eventnya ada di `req.body` yang sudah diparse (jika express.json() ada sebelum raw).
                 // Ini jadi rumit. Lebih baik `verifyWebhookSignature` selalu return event object atau throw.
                 // Kita akan ikuti logika bahwa `validateEvent` dari SDK Polar akan return event object atau throw.
                 // Jika `validatedEvent` false, itu berarti signature gagal atau secret tidak ada di prod.

                 // Jika kita sampai sini karena secret tidak ada di non-prod (verifyWebhookSignature mengembalikan true)
                 // Maka eventType dan eventData perlu diambil dari req.body
                 // Ini SANGAT TIDAK IDEAL. Fungsi verifyWebhookSignature harusnya lebih konsisten.
                 // Untuk sekarang, jika validatedEvent adalah `true` (boolean), kita anggap itu dari dev skip.
                 if (validatedEvent === true && typeof rawBody === 'object' && rawBody.type && rawBody.data) {
                    // Asumsikan rawBody sudah diparse oleh express.json() jika 'express.raw()' tidak sepenuhnya mencegahnya.
                    // ATAU, jika express.raw() bekerja, rawBody adalah Buffer, dan kita sudah parse di atas.
                 } else {
                    // Ini seharusnya tidak terjadi jika validatedEvent bukan objek event.
                    console.error("[Polar Webhook] Unexpected state after signature verification skip.");
                    return res.status(500).json({ message: "Internal error during webhook processing." });
                 }
            }
        }
        // Jika validatedEvent adalah objek event yang berhasil divalidasi oleh SDK Polar
        const eventType = validatedEvent.type;
        const eventData = validatedEvent.data; 
        
        console.log(`[Polar Webhook] Signature VALIDATED. Event Type: ${eventType}, Data ID: ${eventData?.id || 'N/A'}`);

        res.status(202).json({ received: true, message: "Webhook received, processing started." });

        processWebhookEvent(eventType, eventData, req).catch(processingError => {
            console.error("[Polar Webhook] ❌ Asynchronous processing error after 202 response:", processingError);
            errorLogs(req, null, processingError.message, "controllers/paymentControllers/callbackPayment.js - processWebhookEvent Async");
        });

    } catch (error) { 
        console.error("[Polar Webhook] ❌ Error handling webhook request (outer level):", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/callbackPayment.js - Outer Catch");
        if (!res.headersSent) {
            if (error instanceof WebhookVerificationError) { // Error spesifik dari SDK
                 res.status(403).json({ message: `Webhook signature verification failed: ${error.message}` });
            } else {
                 res.status(400).json({ message: "Webhook error: Invalid payload or signature issue." });
            }
        }
    }
};

async function processWebhookEvent(eventType, eventData, req) {
    const session = await mongoose.startSession();
    session.startTransaction();
    let paymentReferenceIdForLog = null; // ID yang digunakan untuk logging, bisa checkout_id, order_id, atau sub_id
    let isSuccessEvent = false;

    try {
        console.log(`[ProcessWebhook] Starting to process event: ${eventType}`);
        
        // Default paymentReferenceIdForLog dari ID event data utama
        paymentReferenceIdForLog = eventData.id;

        switch (eventType) {
            case 'checkout.session.completed': 
                paymentReferenceIdForLog = eventData.id; // Checkout Session ID
                isSuccessEvent = (eventData.status === 'complete' && eventData.payment_status === 'paid');
                if (isSuccessEvent) {
                    // eventData di sini adalah CheckoutSession object dari Polar
                    await handleSuccessfulPayment(eventData, eventType, session, req, eventData.order_id, eventData.id);
                } else {
                    console.log(`[ProcessWebhook] Checkout session ${paymentReferenceIdForLog} completed but not marked as paid. Status: ${eventData.status}, Payment Status: ${eventData.payment_status}`);
                    await handleFailedOrPendingPayment(eventData, eventType, session, 'pending_confirmation');
                }
                break;

            case 'order.succeeded':
            case 'order.paid': // 'order.paid' adalah event yang lebih umum digunakan di @polar-sh/express
                paymentReferenceIdForLog = eventData.id; // Order ID
                // Kita perlu checkout_id untuk mencari payment record lokal
                let checkoutIdForOrder = eventData.checkout_id || eventData.metadata?.polar_checkout_id;
                if (!checkoutIdForOrder && eventData.metadata?.invoice_internal) {
                    const tempPayment = await PaymentModel.findOne({ invoice: eventData.metadata.invoice_internal }).session(session);
                    if (tempPayment) checkoutIdForOrder = tempPayment.polar_checkout_id;
                }
                if (!checkoutIdForOrder) {
                    console.warn(`[ProcessWebhook] Could not determine checkout_id for ${eventType} event ${paymentReferenceIdForLog}. Metadata:`, eventData.metadata);
                    throw new Error(`Missing checkout reference for ${eventType} event: ${paymentReferenceIdForLog}`);
                }
                // eventData di sini adalah Order object dari Polar
                await handleSuccessfulPayment(eventData, eventType, session, req, paymentReferenceIdForLog, checkoutIdForOrder);
                break;
            
            case 'subscription.created':
            case 'subscription.updated':
            case 'subscription.active': // Event ini menandakan langganan aktif
                paymentReferenceIdForLog = eventData.id; // Subscription ID
                let checkoutIdForSub = eventData.metadata?.polar_checkout_id || eventData.checkout_id;
                const customerPolarId = eventData.customer_id;

                // Logika untuk renewal: Jika subscription.updated/active dan ada latest_invoice yang paid.
                // Atau jika ini adalah subscription.created dari checkout baru.
                const isPaidRenewal = (eventType === 'subscription.updated' || eventType === 'subscription.active') &&
                                    eventData.status === 'active' && 
                                    eventData.latest_invoice?.status === 'paid';
                
                const isNewSubFromCheckout = eventType === 'subscription.created' && 
                                           eventData.status === 'active' && // atau 'incomplete' jika pembayaran async
                                           checkoutIdForSub; 

                if (isPaidRenewal || isNewSubFromCheckout) {
                    console.log(`[ProcessWebhook] Active/Paid subscription event: ${eventType}, ID: ${paymentReferenceIdForLog}.`);
                     if (!checkoutIdForSub && eventData.metadata?.invoice_internal) {
                        const tempPayment = await PaymentModel.findOne({ invoice: eventData.metadata.invoice_internal, userId: {$exists: true} }).session(session);
                        if(tempPayment) checkoutIdForSub = tempPayment.polar_checkout_id;
                    }

                    if (!checkoutIdForSub && isPaidRenewal) {
                        // Untuk renewal, mungkin tidak ada checkout_id baru. Cari payment record pending berdasarkan user & package
                        const user = await UserModel.findOne({ polarCustomerId: customerPolarId }).session(session);
                        if (user && eventData.product_id) {
                            // Cari paket lokal yang cocok dengan polar_product_id dari langganan
                            const pkg = await PackageModel.findOne({ polar_product_id: eventData.product_id }).session(session);
                            if (pkg) {
                                // Buat payment record baru untuk renewal jika belum ada yang pending
                                console.log(`[ProcessWebhook] Creating new payment record for renewal. User: ${user._id}, Package: ${pkg._id}`);
                                const invoiceNumber = `RNW-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                                const renewalPayment = new PaymentModel({
                                    userId: user._id,
                                    userName: user.username,
                                    package_id: pkg._id,
                                    polar_product_id: pkg.polar_product_id,
                                    polar_customer_id: customerPolarId,
                                    polar_subscription_id: eventData.id,
                                    payment_status: 'pending', // Akan diupdate oleh handleSuccessfulPayment
                                    total: parseFloat(eventData.amount) / 100, // Konversi dari sen
                                    amount: parseFloat(eventData.amount) / 100,
                                    currency: eventData.currency?.toUpperCase() || 'USD',
                                    invoice: invoiceNumber,
                                    polar_metadata: {
                                        user_id_internal: user._id.toString(),
                                        package_id_internal: pkg._id.toString(),
                                        invoice_internal: invoiceNumber,
                                        renewal_event: eventType
                                    },
                                    payment_time: eventData.current_period_start ? new Date(eventData.current_period_start) : new Date()
                                });
                                await renewalPayment.save({session});
                                checkoutIdForSub = renewalPayment.polar_checkout_id; // Gunakan ID checkout dari payment record baru
                                console.log(`[ProcessWebhook] Created new payment record ${renewalPayment._id} for renewal.`);
                                // eventData untuk handleSuccessfulPayment akan menjadi Subscription object
                                await handleSuccessfulPayment(eventData, eventType, session, req, paymentReferenceIdForLog, checkoutIdForSub, true /* isRenewal */);
                            } else {
                                 throw new Error(`Cannot find local package for Polar product ID ${eventData.product_id} during renewal for sub ${paymentReferenceIdForLog}`);
                            }
                        } else {
                             throw new Error(`Missing checkout reference or user for paid subscription event: ${paymentReferenceIdForLog}`);
                        }
                    } else if (checkoutIdForSub) {
                        // eventData untuk handleSuccessfulPayment akan menjadi Subscription object
                        await handleSuccessfulPayment(eventData, eventType, session, req, paymentReferenceIdForLog, checkoutIdForSub);
                    } else {
                         throw new Error(`Missing checkout reference for new subscription event: ${paymentReferenceIdForLog}`);
                    }
                } else {
                    console.log(`[ProcessWebhook] Subscription event ${eventType} for ${paymentReferenceIdForLog} received, but not clearly indicating a successful payment (Status: ${eventData.status}, Latest Invoice: ${eventData.latest_invoice?.status}).`);
                    // Update status subscription di user model jika hanya status berubah (misal trial berakhir tanpa bayar)
                    if (eventData.status !== 'active' && customerPolarId) {
                         const userToUpdate = await UserModel.findOne({ polarCustomerId: customerPolarId }).session(session);
                         if(userToUpdate){
                            // Logika untuk menonaktifkan premium jika langganan tidak aktif
                            // (Membutuhkan logika yang lebih detail untuk menangani semua activePackage)
                            console.log(`[ProcessWebhook] Subscription ${paymentReferenceIdForLog} for user ${userToUpdate._id} is not active. Review premium status.`);
                         }
                    }
                }
                break;

            case 'checkout.session.expired':
                paymentReferenceIdForLog = eventData.id;
                await handleFailedOrPendingPayment(eventData, eventType, session, 'expired');
                break;
            
            case 'order.payment_failed': // Atau event serupa dari Polar
                paymentReferenceIdForLog = eventData.id; // Order ID
                let checkoutIdForFailedOrder = eventData.checkout_id || eventData.metadata?.polar_checkout_id;
                 if (!checkoutIdForFailedOrder && eventData.metadata?.invoice_internal) {
                    const tempPayment = await PaymentModel.findOne({ invoice: eventData.metadata.invoice_internal }).session(session);
                    if(tempPayment) checkoutIdForFailedOrder = tempPayment.polar_checkout_id;
                }
                await handleFailedOrPendingPayment(eventData, eventType, session, 'failed', checkoutIdForFailedOrder);
                break;
            
            case 'subscription.canceled':
            case 'subscription.revoked': // Revoked biasanya lebih final
                paymentReferenceIdForLog = eventData.id; // Subscription ID
                console.log(`[ProcessWebhook] Received ${eventType} for subscription ${paymentReferenceIdForLog}.`);
                const userWithCanceledSub = await UserModel.findOne({ polarCustomerId: eventData.customer_id }).session(session);
                if (userWithCanceledSub) {
                    console.log(`[ProcessWebhook] Processing cancellation for user ${userWithCanceledSub._id}.`);
                    // Cari paket aktif yang terkait dengan subscriptionId ini di array activePackage pengguna
                    const pkgIndex = userWithCanceledSub.activePackage.findIndex(
                        p => p.packageId && // Pastikan packageId ada
                        PackageModel.findById(p.packageId).then(pkgDoc => pkgDoc && pkgDoc.polar_product_id === eventData.product_id) // Ini async, jadi perlu di-handle
                    );
                    
                    // Simplifikasi: asumsikan subscriptionPackage adalah yang dibatalkan jika cocok product_id
                    // Atau, jika Anda menyimpan polar_subscription_id di entri activePackage
                    let updatePremiumStatus = false;
                    if (userWithCanceledSub.subscriptionPackage) {
                        const currentActivePkgDetails = await PackageModel.findById(userWithCanceledSub.subscriptionPackage).session(session);
                        if (currentActivePkgDetails && currentActivePkgDetails.polar_product_id === eventData.product_id) {
                            userWithCanceledSub.isPremium = false;
                            userWithCanceledSub.premiumAccess = false;
                            userWithCanceledSub.premiumExpiresAt = new Date(); // Berakhir sekarang
                            userWithCanceledSub.subscriptionPackage = null;
                            // Hapus atau tandai entri paket ini di user.activePackage
                            userWithCanceledSub.activePackage = userWithCanceledSub.activePackage.filter(
                                // Ini perlu cara yang lebih baik untuk mencocokkan, misal dengan polar_subscription_id di activePackage item
                                // atau dengan mencocokkan product_id dan mungkin tanggal.
                                // Untuk sementara, kita akan hapus semua jika subscriptionPackage utama dibatalkan.
                                // IDEALNYA: Simpan polar_subscription_id di PaymentModel dan di UserModel.activePackage.packageId merujuk ke PaymentModel._id atau memiliki subId Polar
                                // p => !p.packageId.equals(currentActivePkgDetails._id) // Ini terlalu agresif jika ada tumpukan paket
                            );
                             updatePremiumStatus = true;
                             console.log(`[ProcessWebhook] Main subscription package for user ${userWithCanceledSub._id} canceled.`);
                        }
                    }
                    // TODO: Implementasi logika yang lebih baik untuk multiple active packages dan penentuan paket aktif utama.
                    if (userWithCanceledSub.activePackage.length > 0 && updatePremiumStatus) {
                        // Coba aktifkan paket pending berikutnya jika ada
                         userWithCanceledSub.activePackage.sort((a, b) => b.priority - a.priority || new Date(a.activeDate) - new Date(b.activeDate));
                         const nextTopPackage = userWithCanceledSub.activePackage.find(p => p.statusActive === false && p.pendingDate > 0);
                         if(nextTopPackage){
                            nextTopPackage.activeDate = new Date(Date.now() + nextTopPackage.pendingDate * 24 * 60 * 60 * 1000);
                            nextTopPackage.statusActive = true;
                            nextTopPackage.pendingDate = 0;
                            userWithCanceledSub.isPremium = true;
                            userWithCanceledSub.premiumAccess = true;
                            userWithCanceledSub.subscriptionPackage = nextTopPackage.packageId;
                            userWithCanceledSub.premiumExpiresAt = nextTopPackage.activeDate;
                             console.log(`[ProcessWebhook] Activated next pending package for user ${userWithCanceledSub._id}.`);
                         }
                    }


                    await userWithCanceledSub.save({ session });
                    console.log(`[ProcessWebhook] User ${userWithCanceledSub._id} subscription status updated due to ${eventType}.`);
                } else {
                    console.warn(`[ProcessWebhook] User not found with Polar Customer ID ${eventData.customer_id} for ${eventType}.`);
                }
                break;


            default:
                console.log(`[ProcessWebhook] Unhandled event type: ${eventType}. Data:`, JSON.stringify(eventData, null, 2));
        }

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        console.error(`[ProcessWebhook] ❌ Error processing event ${eventType} (Ref ID for log: ${paymentReferenceIdForLog}):`, error);
        errorLogs(req, null, `Webhook processing error for event ${eventType}, Ref: ${paymentReferenceIdForLog}: ${error.message}`, "controllers/paymentControllers/callbackPayment.js - processWebhookEvent");
    } finally {
        session.endSession();
        console.log(`[ProcessWebhook] Finished processing event: ${eventType}, Ref ID for log: ${paymentReferenceIdForLog}`);
    }
}


async function handleSuccessfulPayment(eventData, eventType, session, req, orderOrSubIdForLog, checkoutSessionIdForLookup, isRenewal = false) {
    const paymentLookupId = checkoutSessionIdForLookup;

    console.log(`[WebhookSuccess] Processing successful payment. Event: ${eventType}, Polar Order/Sub ID: ${orderOrSubIdForLog}, PaymentLookupRef (CheckoutID): ${paymentLookupId}`);

    let payment;
    if (isRenewal && eventType.startsWith('subscription.')) {
        // Untuk renewal, kita cari payment record yang mungkin baru dibuat atau masih pending berdasarkan polar_subscription_id
        payment = await PaymentModel.findOne({
            polar_subscription_id: eventData.id, // ID langganan dari event
            // payment_status: { $ne: 'paid' } // Cari yang belum paid, atau yang paling baru jika ada beberapa
        }).sort({createdAt: -1}).session(session);
        if (!payment) {
            // Ini terjadi jika renewal hook datang sebelum payment record dibuat (misal oleh subscription.active hook)
            // Atau jika payment record tidak ditemukan sama sekali.
            console.warn(`[WebhookSuccess] No direct payment record found by subscription_id ${eventData.id} for renewal. This might be handled by a newly created payment record for renewal.`);
             // Jika kita sudah membuat payment record di `processWebhookEvent` untuk renewal `subscription.active`, maka `paymentLookupId` akan menjadi `renewalPayment.polar_checkout_id` (yang mana null)
             // atau `renewalPayment._id` (jika kita menggunakannya untuk lookup).
             // Perlu konsistensi. Jika `paymentLookupId` di sini adalah ID internal payment yang baru dibuat, gunakan itu.
             if (mongoose.Types.ObjectId.isValid(paymentLookupId)) { // Cek apakah ini ID MongoDB
                payment = await PaymentModel.findById(paymentLookupId).session(session);
             }
        }


    } else if (paymentLookupId) {
         payment = await PaymentModel.findOne({
            polar_checkout_id: paymentLookupId 
        }).session(session);
    }


    if (!payment) {
        console.warn(`[WebhookSuccess] Payment record not found for lookup ID: ${paymentLookupId}. Event: ${eventType}, Polar Order/Sub ID: ${orderOrSubIdForLog}`);
        if (eventData.metadata?.user_id_internal && eventData.metadata?.package_id_internal) {
            console.log(`[WebhookSuccess] Event metadata contains internal IDs: User ${eventData.metadata.user_id_internal}, Package ${eventData.metadata.package_id_internal}. Manual check needed.`);
        }
        return; 
    }

    if (payment.payment_status === 'paid') {
        console.log(`[WebhookSuccess] Payment ${payment._id} (Lookup ID: ${paymentLookupId}) already marked as paid. Skipping. Event: ${eventType}`);
        return;
    }

    payment.payment_status = 'paid';
    payment.updatedBy = 'webhook';
    
    if (eventType.includes('order') && eventData.id) payment.polar_order_id = eventData.id; // Order ID dari event order
    else if (eventData.order_id) payment.polar_order_id = eventData.order_id; // Order ID dari event checkout
    
    if (eventType.startsWith('subscription.') && eventData.id) payment.polar_subscription_id = eventData.id; // Sub ID dari event sub
    else if (eventData.subscription_id) payment.polar_subscription_id = eventData.subscription_id; // Sub ID dari event checkout
    
    if(eventData.customer_id) payment.polar_customer_id = eventData.customer_id;

    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData; 
    payment.polar_metadata.webhook_processed_at = new Date().toISOString();
    if (!payment.payment_time) payment.payment_time = new Date();

    await payment.save({ session });
    console.log(`[WebhookSuccess] Payment ${payment._id} status updated to 'paid'.`);

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
        console.error(`[WebhookSuccess] CRITICAL: User (ID: ${payment.userId}) or Package (ID: ${payment.package_id}) not found for payment: ${payment._id}.`);
        throw new Error("User or Package not found during successful webhook processing.");
    }

    const currentDate = new Date();
    let newExpiryDateForThisPackage = new Date(currentDate);
    newExpiryDateForThisPackage.setDate(currentDate.getDate() + packageDetails.durationInDays);

    const newActivePackageEntry = {
        packageId: packageDetails._id,
        activeDate: newExpiryDateForThisPackage,
        priority: packageDetails.priority,
        statusActive: true,
        pendingDate: 0,
        // Simpan referensi ke payment atau subscription Polar jika relevan untuk paket ini
        polarSubscriptionIdRef: payment.polar_subscription_id || null 
    };

    let existingPackageIndex = -1;
    if (user.activePackage && user.activePackage.length > 0) {
        // Cari berdasarkan packageId ATAU jika ini renewal, cocokkan dengan polarSubscriptionIdRef
        existingPackageIndex = user.activePackage.findIndex(
            pkg => (pkg.packageId && pkg.packageId.equals(packageDetails._id)) || 
                   (isRenewal && pkg.polarSubscriptionIdRef === payment.polar_subscription_id)
        );
    } else {
        user.activePackage = [];
    }
    

    if (existingPackageIndex !== -1) {
        const currentActiveDate = user.activePackage[existingPackageIndex].activeDate;
        let baseDateForExtension = (currentActiveDate && new Date(currentActiveDate) > currentDate) ? new Date(currentActiveDate) : new Date(currentDate);
        
        const extendedExpiredTime = new Date(baseDateForExtension);
        extendedExpiredTime.setDate(baseDateForExtension.getDate() + packageDetails.durationInDays);
        
        user.activePackage[existingPackageIndex].activeDate = extendedExpiredTime;
        user.activePackage[existingPackageIndex].statusActive = true;
        user.activePackage[existingPackageIndex].pendingDate = 0;
        if (isRenewal) user.activePackage[existingPackageIndex].polarSubscriptionIdRef = payment.polar_subscription_id;
        newExpiryDateForThisPackage = extendedExpiredTime;
        console.log(`[WebhookSuccess] Extended existing package ${packageDetails.packageName} for user ${user.username}. New expiry: ${newExpiryDateForThisPackage}`);
    } else {
        user.activePackage.push(newActivePackageEntry);
        console.log(`[WebhookSuccess] Added new package ${packageDetails.packageName} to user ${user.username}.`);
    }

    user.activePackage.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (new Date(b.activeDate)).getTime() - (new Date(a.activeDate)).getTime();
    });

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
            `Polar Event - Order/Sub ID: ${orderOrSubIdForLog}, PaymentRef (CheckoutID): ${paymentLookupId}`
        );
    } catch (logError) {
        console.error("[WebhookSuccess] Error creating log action for successful payment:", logError);
    }
}

async function handleFailedOrPendingPayment(eventData, eventType, session, targetStatus, checkoutSessionIdForLookup = null) {
    const paymentLookupId = checkoutSessionIdForLookup || (eventType.startsWith('checkout') ? eventData.id : (eventData.checkout_session_id || eventData.checkout_id || eventData.metadata?.polar_checkout_id));

    if (!paymentLookupId) {
        console.warn(`[WebhookFailOrPending] No valid payment reference ID found in eventData for event ${eventType}. Data:`, eventData);
        return;
    }
    
    console.log(`[WebhookFailOrPending] Processing ${targetStatus} payment. Event: ${eventType}, Lookup ID: ${paymentLookupId}`);

    const payment = await PaymentModel.findOne({
        polar_checkout_id: paymentLookupId, // Selalu cari berdasarkan checkout_id jika tersedia
        payment_status: 'pending' 
    }).session(session);

    if (!payment) {
        console.warn(`[WebhookFailOrPending] Pending payment record not found for Lookup ID: ${paymentLookupId}, or already processed for event ${eventType}.`);
        return;
    }

    payment.payment_status = targetStatus;
    payment.updatedBy = 'webhook';
    payment.polar_metadata.webhook_event_type = eventType;
    payment.polar_metadata.webhook_event_data = eventData;
    payment.polar_metadata.webhook_processed_at = new Date().toISOString();
    if(eventData.customer_id && !payment.polar_customer_id) payment.polar_customer_id = eventData.customer_id;
    if(eventData.id && eventType.includes('order')) payment.polar_order_id = eventData.id; // Simpan order_id jika ini event order

    await payment.save({ session });

    console.log(`[WebhookFailOrPending] Payment ${payment._id} status updated to '${payment.payment_status}' for event ${eventType}.`);
}


// Legacy callback handler (Tripay)
exports.paymentCallBack = async (req, res) => {
    console.log("[Legacy Tripay Callback] Received. System primarily uses Polar.sh webhooks.");
    return res.status(200).json({
        success: true,
        message: "Legacy Tripay callback received. No action taken by default as Polar.sh is primary."
    });
};

// Tambahkan referensi ke productsAPI jika belum ada di atas file
const productsAPI = require('../../services/polar/products');