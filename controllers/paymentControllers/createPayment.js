// hawkinskaban/designrhub-be/DesignrHub-BE-743d01fe988c64504378ca89e040937981f4cb6f/controllers/paymentControllers/createPayment.js

const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const VoucherModel = require("../../models/voucerModel"); // Verify 'voucerModel' vs 'voucherModel'
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");
const crypto = require('crypto'); // For generating invoice or unique references

exports.createUserPayment = async (req, res) => {
    const { package_id, voucher_code } = req.body;
    const userId = req.userId; // Provided by the 'protect' middleware

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
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "User not found." });
        }

        const selectedPackage = await PackageModel.findById(package_id).session(session);
        if (!selectedPackage) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Package not found." });
        }

        if (!selectedPackage.isActive || !selectedPackage.polar_product_id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Selected package is not currently active or not synchronized with the payment gateway." });
        }
        
        const polarProduct = await polarService.getProduct(selectedPackage.polar_product_id);
        if (!polarProduct || !polarProduct.prices || polarProduct.prices.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({ message: "Could not retrieve product pricing details from the payment gateway." });
        }

        // Find an active, recurring, USD price for the product. Adjust if your logic for selecting a price is different.
        const polarPrice = polarProduct.prices.find(p => p.type === "recurring" && !p.isArchived && p.price_currency && p.price_currency.toLowerCase() === 'usd');
        if (!polarPrice || !polarPrice.id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({ message: "No suitable active price tier found for the selected package on the payment gateway." });
        }

        let packagePriceUSD = parseFloat(selectedPackage.price);
        let finalAmountUSD = packagePriceUSD;
        let discountAmountUSD = 0;
        let appliedVoucher = null;
        let polarDiscountIdToApply = null; // This will hold the Polar Discount ID

        if (voucher_code) {
            appliedVoucher = await VoucherModel.findOne({
                code: voucher_code,
                status: 'open',
                isArchived: false,
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).session(session);

            if (appliedVoucher) {
                const isUsageLimitReached = appliedVoucher.usageLimit !== null && appliedVoucher.timesUsed >= appliedVoucher.usageLimit;
                const isMinPurchaseMet = packagePriceUSD >= (appliedVoucher.minimumPurchaseAmount || 0);
                const isPackageApplicable = !appliedVoucher.packageId || appliedVoucher.packageId.length === 0 || appliedVoucher.packageId.some(id => id.equals(selectedPackage._id));

                if (!isUsageLimitReached && isMinPurchaseMet && isPackageApplicable) {
                    if (appliedVoucher.polar_discount_id) {
                        polarDiscountIdToApply = appliedVoucher.polar_discount_id;
                        console.log(`[CreateUserPayment] Applying Polar discount ID: ${polarDiscountIdToApply} for voucher ${appliedVoucher.code}`);
                    } else {
                        console.warn(`[CreateUserPayment] Voucher ${appliedVoucher.code} is valid locally but has no associated Polar Discount ID. The discount may not be applied by Polar.`);
                    }
                    // Calculate discount for local record keeping. Polar will apply the discount if polarDiscountIdToApply is provided.
                    if (appliedVoucher.discountType === 'percentage') {
                        discountAmountUSD = (parseFloat(appliedVoucher.discount) / 100) * packagePriceUSD;
                    } else if (appliedVoucher.discountType === 'fixed') {
                        discountAmountUSD = parseFloat(appliedVoucher.discount);
                    }
                    discountAmountUSD = Math.min(discountAmountUSD, packagePriceUSD); // Ensure discount isn't more than price
                    finalAmountUSD = Math.max(0, packagePriceUSD - discountAmountUSD);
                } else {
                    appliedVoucher = null; // Voucher conditions not met
                }
            }
        }
        
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const paymentRecord = {
            userId: user._id,
            userName: user.username,
            package_id: selectedPackage._id,
            polar_product_id: selectedPackage.polar_product_id,
            payment_status: 'pending',
            amount: finalAmountUSD, // Net amount in USD
            total: packagePriceUSD,   // Gross amount in USD
            voucher_id: appliedVoucher ? appliedVoucher._id : null,
            discount_amount: discountAmountUSD,
            invoice: invoiceNumber,
            currency: 'USD',
            polar_metadata: {
                user_id: user._id.toString(),
                user_email: user.email,
                package_id: selectedPackage._id.toString(),
                package_name: selectedPackage.packageName,
                invoice_internal: invoiceNumber,
                ...(appliedVoucher && { 
                    voucher_code_internal: appliedVoucher.code, 
                    voucher_id_internal: appliedVoucher._id.toString(),
                    ...(polarDiscountIdToApply && { polar_discount_id_ref: polarDiscountIdToApply })
                })
            }
        };

        const newPayment = new PaymentModel(paymentRecord);
        await newPayment.save({ session });

        const successUrl = `${process.env.FE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id={ORDER_ID}&payment_id=${newPayment._id}`;
        const cancelUrl = `${process.env.FE_URL}/payment-cancelled?payment_id=${newPayment._id}`;
        
        const checkoutPayload = {
            lineItems: [{ price_id: polarPrice.id, quantity: 1 }],
            successUrl: successUrl,
            cancelUrl: cancelUrl,
            customerEmail: user.email,
            // customerId: user.polarCustomerId, // If you have and want to use Polar Customer ID
            metadata: newPayment.polar_metadata, // Pass the metadata to Polar
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // Example: 30 minutes expiry
        };

        if (polarDiscountIdToApply) {
            checkoutPayload.discounts = [{ discount_id: polarDiscountIdToApply }];
        }

        const polarCheckoutSession = await polarService.createCheckout(checkoutPayload);

        newPayment.polar_checkout_id = polarCheckoutSession.id;
        newPayment.checkout_url = polarCheckoutSession.url;
        newPayment.expired_time = new Date(polarCheckoutSession.expires_at || Date.now() + 30 * 60 * 1000);
        newPayment.polar_metadata.polar_checkout_creation_response = polarCheckoutSession; // Store full response if needed
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
        await session.abortTransaction();
        session.endSession();
        console.error('[CreateUserPayment] Error creating payment:', error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js (createUserPayment)");
        const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message;
        res.status(500).json({ message: "Failed to initiate payment.", error: errorMessage });
    }
};