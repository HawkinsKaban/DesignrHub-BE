// controllers/paymentControllers/createPayment.js
const mongoose = "mongoose";
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const VoucherModel = require("../../models/voucerModel"); // Pastikan nama model konsisten
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");
const crypto = require('crypto');

exports.createUserPayment = async (req, res) => {
    const { package_id, voucher_code } = req.body;
    const userId = req.userId;

    if (!package_id) {
        return res.status(400).json({ message: "Package ID is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(package_id)) {
        return res.status(400).json({ message: "Invalid Package ID format." });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await UserModel.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "User not found." });
        }

        const selectedPackage = await PackageModel.findById(package_id).session(session);
        if (!selectedPackage) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ message: "Package not found." });
        }

        if (!selectedPackage.isActive) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ message: "Selected package is not currently active." });
        }
        if (!selectedPackage.polar_product_id) {
            await session.abortTransaction(); session.endSession();
            console.error(`[CreateUserPaymentCtrl] Package ${selectedPackage.packageName} (ID: ${selectedPackage._id}) is not synchronized with Polar (missing polar_product_id).`);
            return res.status(500).json({ message: "Selected package is not synchronized with the payment gateway. Please contact support." });
        }
        
        const polarProduct = await polarService.getProduct(selectedPackage.polar_product_id);
        if (!polarProduct || !polarProduct.prices || polarProduct.prices.length === 0) {
            await session.abortTransaction(); session.endSession();
            console.error(`[CreateUserPaymentCtrl] Could not retrieve product or pricing details from Polar for product ID: ${selectedPackage.polar_product_id}`);
            return res.status(500).json({ message: "Could not retrieve product pricing details from the payment gateway." });
        }

        // Tentukan interval recurring berdasarkan durasi paket
        const recurringInterval = polarService.determineRecurringInterval(selectedPackage.durationInDays);

        // Cari harga yang sesuai (recurring, USD, interval cocok, dan aktif)
        const polarPrice = polarProduct.prices.find(p => 
            p.type === "recurring" &&
            p.recurring_interval === recurringInterval && // Cocokkan interval
            p.price_currency?.toLowerCase() === 'usd' &&
            !p.is_archived // Pastikan harga tidak diarsipkan
        );
        
        if (!polarPrice || !polarPrice.id) {
            await session.abortTransaction(); session.endSession();
            console.error(`[CreateUserPaymentCtrl] No suitable active USD recurring price tier found for interval '${recurringInterval}' for Polar product ID: ${selectedPackage.polar_product_id}. Prices available:`, polarProduct.prices);
            return res.status(500).json({ message: `No suitable active price tier found for the selected package's duration (${selectedPackage.durationName}) on the payment gateway.` });
        }
        console.log(`[CreateUserPaymentCtrl] Using Polar price ID: ${polarPrice.id} (Amount: ${polarPrice.price_amount} ${polarPrice.price_currency}/${polarPrice.recurring_interval})`);


        let packagePriceUSD = parseFloat(selectedPackage.price); // Harga asli paket
        let finalAmountUSD = packagePriceUSD;
        let discountAmountUSD = 0;
        let appliedVoucher = null;
        let polarDiscountIdToApply = null;

        if (voucher_code) {
            appliedVoucher = await VoucherModel.findOne({
                code: voucher_code.toUpperCase(), // Cocokkan dengan kode uppercase
                status: 'open',
                isArchived: false, // Pastikan tidak diarsipkan
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).session(session);

            if (appliedVoucher) {
                const isUsageLimitReached = appliedVoucher.usageLimit !== null && appliedVoucher.timesUsed >= appliedVoucher.usageLimit;
                const isMinPurchaseMet = packagePriceUSD >= (appliedVoucher.minimumPurchaseAmount || 0);
                // Cek apakah voucher berlaku untuk paket ini (jika packageId di voucher diisi)
                const isPackageApplicable = !appliedVoucher.packageId || appliedVoucher.packageId.length === 0 || appliedVoucher.packageId.some(id => id.equals(selectedPackage._id));

                if (!isUsageLimitReached && isMinPurchaseMet && isPackageApplicable) {
                    if (appliedVoucher.polar_discount_id) {
                        polarDiscountIdToApply = appliedVoucher.polar_discount_id;
                        console.log(`[CreateUserPaymentCtrl] Applying Polar discount ID: ${polarDiscountIdToApply} for voucher ${appliedVoucher.code}`);
                        
                        // Kalkulasi diskon untuk catatan lokal (Polar akan menangani kalkulasi sebenarnya)
                        if (appliedVoucher.discountType === 'percentage') {
                            discountAmountUSD = (parseFloat(appliedVoucher.discount) / 100) * packagePriceUSD;
                        } else if (appliedVoucher.discountType === 'fixed') {
                            discountAmountUSD = parseFloat(appliedVoucher.discount);
                        }
                        discountAmountUSD = Math.min(discountAmountUSD, packagePriceUSD); // Diskon tidak boleh > harga
                        finalAmountUSD = Math.max(0, packagePriceUSD - discountAmountUSD); // Harga akhir tidak boleh < 0
                    } else {
                        console.warn(`[CreateUserPaymentCtrl] Voucher ${appliedVoucher.code} is valid locally but has no associated Polar Discount ID. The discount will NOT be applied by Polar.`);
                        // Jika ini terjadi, Anda mungkin ingin GAGALKAN checkout atau informasikan pengguna
                        // Untuk sekarang, kita biarkan tanpa diskon Polar jika ID tidak ada.
                        appliedVoucher = null; // Anggap voucher tidak jadi dipakai jika tidak ada ID Polar
                    }
                } else {
                    console.log(`[CreateUserPaymentCtrl] Voucher ${voucher_code} conditions not met. Usage Limit: ${isUsageLimitReached}, Min Purchase: ${isMinPurchaseMet}, Package Applicable: ${isPackageApplicable}`);
                    appliedVoucher = null; // Voucher tidak valid atau tidak memenuhi syarat
                }
            } else {
                 console.log(`[CreateUserPaymentCtrl] Voucher ${voucher_code} not found or not valid.`);
            }
        }
        
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        const paymentRecord = {
            userId: user._id,
            userName: user.username,
            package_id: selectedPackage._id,
            polar_product_id: selectedPackage.polar_product_id,
            polar_customer_id: user.polarCustomerId || null, // Sertakan ID customer Polar jika ada
            payment_status: 'pending',
            total: packagePriceUSD,        // Harga asli paket dalam USD
            amount: finalAmountUSD,        // Harga akhir setelah diskon dalam USD
            discount_amount: discountAmountUSD, // Jumlah diskon dalam USD
            voucher_id: appliedVoucher ? appliedVoucher._id : null,
            voucher_code_applied: appliedVoucher ? appliedVoucher.code : null,
            invoice: invoiceNumber,
            currency: 'USD',
            polar_metadata: { // Metadata yang akan dikirim ke Polar
                user_id_internal: user._id.toString(),
                user_email_internal: user.email, // Untuk referensi
                package_id_internal: selectedPackage._id.toString(),
                package_name_internal: selectedPackage.packageName,
                invoice_internal: invoiceNumber,
                ...(appliedVoucher && polarDiscountIdToApply && { // Hanya jika diskon Polar akan diterapkan
                    voucher_code_internal: appliedVoucher.code, 
                    voucher_id_internal: appliedVoucher._id.toString(),
                    polar_discount_id_ref: polarDiscountIdToApply 
                })
            }
        };

        const newPayment = new PaymentModel(paymentRecord);
        await newPayment.save({ session });
        console.log(`[CreateUserPaymentCtrl] Local payment record created: ${newPayment._id}`);

        const successUrl = `${process.env.FE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&payment_id=${newPayment._id.toString()}`; // Tambahkan payment_id
        const cancelUrl = `${process.env.FE_URL}/payment-cancelled?payment_id=${newPayment._id.toString()}`; // Tambahkan payment_id
        
        const checkoutPayload = {
            line_items: [{ price_id: polarPrice.id, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            customer_email: user.email, // Polar bisa membuat customer on-the-fly atau menggunakan yang ada
            // Jika user.polarCustomerId ada, gunakan itu:
            ...(user.polarCustomerId && { customer_id: user.polarCustomerId }),
            metadata: newPayment.polar_metadata,
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // Checkout berlaku 30 menit
        };

        if (polarDiscountIdToApply) {
            checkoutPayload.discounts = [{ coupon: polarDiscountIdToApply }]; // Polar mungkin menggunakan 'coupon' atau 'discount_id'
                                                                             // Cek dokumentasi SDK: `discounts: [{ discount_id: 'string' }]` atau `discounts: [{ coupon: 'string' }]`
                                                                             // API reference sebelumnya menyebut `discounts: [{ discount_id: 'string' }]`
            checkoutPayload.discounts = [{ discount_id: polarDiscountIdToApply }];
        }

        const polarCheckoutSession = await polarService.createCheckout(checkoutPayload);

        newPayment.polar_checkout_id = polarCheckoutSession.id;
        newPayment.checkout_url = polarCheckoutSession.url; // URL redirect ke halaman checkout Polar
        newPayment.expired_time = new Date(polarCheckoutSession.expires_at || (Date.now() + 30 * 60 * 1000));
        newPayment.polar_metadata.polar_checkout_session_details = polarCheckoutSession; // Simpan detail sesi checkout dari Polar
        await newPayment.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "Checkout session initiated successfully.",
            checkoutUrl: polarCheckoutSession.url,
            paymentId: newPayment._id,
            polarCheckoutId: polarCheckoutSession.id
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error('[CreateUserPaymentCtrl] ❌ Error creating payment:', error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js (createUserPayment)");
        const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message;
        res.status(500).json({ message: "Failed to initiate payment.", error: errorMessage });
    }
};