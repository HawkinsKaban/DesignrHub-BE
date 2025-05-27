const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");
const polarService = require("../../services/polarService");
require("dotenv").config();

exports.createUserPayment = async (req, res) => {
    const { package_id, voucher_code, afiliator_id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log(`[CreatePayment] User ${req.user._id} initiating payment for package ${package_id} with voucher code ${voucher_code}`);
        const packageDetails = await PackageModel.findById(package_id).session(session);
        if (!packageDetails) {
            await session.abortTransaction();
            session.endSession();
            console.warn(`[CreatePayment] Package not found: ${package_id}`);
            return res.status(404).json({ message: "Package not found" });
        }

        const countPayment = await PaymentModel.countDocuments().session(session);
        const hariIni = new Date();
        const hari = String(hariIni.getDate()).padStart(2, "0");
        const bulan = String(hariIni.getMonth() + 1).padStart(2, "0");
        const invoice = `INV${hari}${bulan}${hariIni.getFullYear()}${countPayment + 1}`;

        let originalAmountUSD = parseFloat(packageDetails.price);
        if (isNaN(originalAmountUSD) || originalAmountUSD < 0) {
            await session.abortTransaction(); session.endSession();
            throw new Error("Package price is not a valid non-negative number.");
        }
        let packageDiscountAmountUSD = 0;
        let finalAmountUSD = originalAmountUSD;

        if (packageDetails.onDiscount && packageDetails.discountPrice != null && parseFloat(packageDetails.discountPrice) >=0 && new Date(packageDetails.endDiscountDate) > new Date()) {
            const discountPriceUSD = parseFloat(packageDetails.discountPrice);
            if (!isNaN(discountPriceUSD)) {
                packageDiscountAmountUSD = Math.max(0, originalAmountUSD - discountPriceUSD);
                finalAmountUSD = discountPriceUSD;
                console.log(`[CreatePayment] Applied package discount. Original: ${originalAmountUSD}, Discounted: ${finalAmountUSD}`);
            }
        }

        let totalDiscountAmountUSD = packageDiscountAmountUSD;
        let appliedVoucherId = null;
        let voucherCodeForPolar = null;

        if (voucher_code) {
            const voucherData = await VoucherModel.findOne({ code: voucher_code, status: 'open' }).session(session);
            if (voucherData && new Date(voucherData.endDate) > new Date()) {
                console.log(`[CreatePayment] Found active voucher: ${voucherData.name} (ID: ${voucherData._id})`);
                if (voucherData.usageLimit !== null && voucherData.timesUsed >= voucherData.usageLimit) {
                    console.log(`[CreatePayment] Voucher ${voucher_code} has reached its usage limit.`);
                } else if (finalAmountUSD < voucherData.minimumPurchaseAmount) {
                    console.log(`[CreatePayment] Purchase amount ${finalAmountUSD} USD is less than minimum ${voucherData.minimumPurchaseAmount} USD for voucher ${voucher_code}.`);
                } else if (voucherData.packageId && voucherData.packageId.length > 0 && !voucherData.packageId.some(id => id.equals(packageDetails._id))) {
                    console.log(`[CreatePayment] Voucher ${voucher_code} does not apply to package ${packageDetails._id}.`);
                } else {
                    let voucherDiscountUSD = 0;
                    if (voucherData.discountType === "percentage") {
                        const discountValue = parseFloat(voucherData.discount);
                        if(!isNaN(discountValue)) voucherDiscountUSD = (finalAmountUSD * discountValue) / 100;
                    } else { 
                        const discountValue = parseFloat(voucherData.discount);
                        if(!isNaN(discountValue)) voucherDiscountUSD = discountValue;
                    }
                    voucherDiscountUSD = Math.max(0, Math.min(voucherDiscountUSD, finalAmountUSD));

                    finalAmountUSD -= voucherDiscountUSD;
                    totalDiscountAmountUSD += voucherDiscountUSD;
                    appliedVoucherId = voucherData._id;
                    voucherCodeForPolar = voucherData.code;
                    console.log(`[CreatePayment] Applied voucher ${voucher_code}. Discount Value: ${voucherDiscountUSD} USD. New final amount: ${finalAmountUSD} USD`);
                }
            } else {
                console.log(`[CreatePayment] Voucher code ${voucher_code} not found or not active/expired.`);
            }
        }

        finalAmountUSD = Math.max(finalAmountUSD, 0); 
        const amountInCents = Math.round(finalAmountUSD * 100); 

        const metadataForPolar = {
            user_id: req.user._id.toString(),
            package_id: packageDetails._id.toString(),
            invoice: invoice,
            original_amount_usd: originalAmountUSD.toString(), 
            total_discount_amount_usd: totalDiscountAmountUSD.toString(),
            final_amount_usd_calculated: finalAmountUSD.toString(),
            platform: 'designrhub'
        };

        if (appliedVoucherId) {
            metadataForPolar.voucher_id_internal = appliedVoucherId.toString();
        }
        if (afiliator_id) {
            metadataForPolar.afiliator_id = afiliator_id.toString();
        }

        if (!packageDetails.polar_product_id) {
            try {
                console.log(`[CreatePayment] Polar product ID not found for package ${packageDetails.packageName}. Creating Polar product...`);
                const polarProduct = await polarService.createProduct(packageDetails);
                packageDetails.polar_product_id = polarProduct.id;
                packageDetails.polar_metadata = polarProduct; 
                await packageDetails.save({ session });
                console.log(`[CreatePayment] Polar product created/updated: ${polarProduct.id}`);
            } catch (productError) {
                console.error("[CreatePayment] Error creating/updating Polar product:", productError);
                throw new Error(`Failed to sync package with payment provider: ${productError.message}`);
            }
        }

        const refreshedPackageDetails = await PackageModel.findById(package_id).session(session); 
        let productPriceIdForPolar = null;
        if (refreshedPackageDetails.polar_metadata?.prices?.length > 0) {
            productPriceIdForPolar = refreshedPackageDetails.polar_metadata.prices[0].id;
        } else {
             console.warn(`[CreatePayment] Could not find price_id in polar_metadata for package ${refreshedPackageDetails._id}. Attempting custom amount checkout.`);
        }

        const checkoutPayloadForPolar = {
            customerEmail: req.user.email,
            customerName: req.user.username,
            customerExternalId: req.user._id.toString(),
            successUrl: `${process.env.FE_URL}payment/success?checkout_id={CHECKOUT_ID}`,
            cancelUrl: `${process.env.FE_URL}payment/cancelled?checkout_id={CHECKOUT_ID}`,
            metadata: metadataForPolar,
            currency: "USD",
        };

        if (voucherCodeForPolar) { 
            checkoutPayloadForPolar.discountCode = voucherCodeForPolar;
        }

        if (productPriceIdForPolar && refreshedPackageDetails.polar_product_id) {
             // Corrected: products should be an array of price ID strings
             checkoutPayloadForPolar.products = [productPriceIdForPolar];
             console.log(`[CreatePayment] Using products (array of price IDs) for checkout. Price ID: ${productPriceIdForPolar}. Polar will calculate final amount with discountCode if provided.`);
        } else {
            checkoutPayloadForPolar.amount = amountInCents; 
            console.warn(`[CreatePayment] Using custom amount checkout for package ${package_id}. Amount: ${amountInCents} cents USD. Voucher (if any) already applied in this amount.`);
        }

        console.log("[CreatePayment] Creating Polar checkout session with payload:", JSON.stringify(checkoutPayloadForPolar, null, 2));
        const polarCheckout = await polarService.createCheckout(checkoutPayloadForPolar);

        const expiredTime = polarCheckout.expires_at ? new Date(polarCheckout.expires_at) : new Date(Date.now() + (24 * 60 * 60 * 1000)); 

        const newUserPayment = new PaymentModel({
            userId: req.user._id,
            userName: req.user.username,
            package_id: packageDetails._id,
            payment_time: Date.now(),
            expired_time: expiredTime,
            polar_checkout_id: polarCheckout.id,
            reference: polarCheckout.id,
            admin: 0, 
            amount: finalAmountUSD, 
            total: originalAmountUSD, 
            discount_amount: totalDiscountAmountUSD, 
            checkout_url: polarCheckout.url,
            invoice,
            voucher_id: appliedVoucherId,
            afiliator_id: afiliator_id || undefined,
            polar_metadata: polarCheckout, 
            currency: "USD"
        });

        await newUserPayment.save({ session });
        await session.commitTransaction();
        session.endSession();

        console.log(`[CreatePayment] Payment record created (ID: ${newUserPayment._id}), Polar checkout URL: ${polarCheckout.url}`);
        res.status(201).json({
            success: true,
            message: "Checkout session created successfully with Polar",
            checkout_url: polarCheckout.url,
            checkout_id: polarCheckout.id,
            expires_at: polarCheckout.expires_at, 
            total_amount_usd: finalAmountUSD,
            invoice: invoice
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("[CreatePayment] ❌ Payment creation failed:", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");

        res.status(500).json({
            success: false,
            message: "Failed to create payment",
            error: error.message,
        });
    }
};