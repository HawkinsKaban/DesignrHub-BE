const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel"); //
const PaymentModel = require("../../models/paymentModel"); //
const PackageModel = require("../../models/packageModel"); //
const { errorLogs } = require("../../utils/errorLogs"); //
const polarService = require("../../services/polarService"); //
require("dotenv").config(); //

exports.createUserPayment = async (req, res) => {
    const { package_id, voucher_code, afiliator_id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log(`[CreatePayment] User ${req.user._id} initiating payment for package ${package_id} with voucher code ${voucher_code}`);

        if (!process.env.FE_URL || process.env.FE_URL.trim() === '') {
            await session.abortTransaction(); session.endSession();
            console.error("[CreatePayment] FE_URL environment variable is not set or is empty.");
            return res.status(500).json({ success: false, message: "Configuration error: Frontend URL is not set.", error: "FE_URL is missing in server configuration." });
        }
        let feBaseUrl;
        try {
            feBaseUrl = new URL(process.env.FE_URL);
            if (!feBaseUrl.protocol || !feBaseUrl.hostname) throw new Error("Invalid URL structure for FE_URL");
        } catch (urlError) {
            await session.abortTransaction(); session.endSession();
            console.error(`[CreatePayment] FE_URL is not a valid URL: ${process.env.FE_URL}`, urlError);
            return res.status(500).json({ success: false, message: "Configuration error: Frontend URL is invalid.", error: `FE_URL (${process.env.FE_URL}) is not a valid URL.` });
        }

        const packageDetails = await PackageModel.findById(package_id).session(session);
        if (!packageDetails) {
            await session.abortTransaction(); session.endSession();
            console.warn(`[CreatePayment] Package not found: ${package_id}`);
            return res.status(404).json({ message: "Package not found" });
        }
        console.log(`[CreatePayment] Package found: ${packageDetails.packageName}, Local Polar Product ID: ${packageDetails.polar_product_id}`);
        if (packageDetails.polar_metadata && packageDetails.polar_metadata.prices) {
            console.log(`[CreatePayment] Local Polar Metadata Prices: `, JSON.stringify(packageDetails.polar_metadata.prices));
        } else {
            console.log(`[CreatePayment] No local Polar Metadata Prices found for package ${packageDetails._id}`);
        }


        const countPayment = await PaymentModel.countDocuments().session(session);
        const hariIni = new Date();
        const hari = String(hariIni.getDate()).padStart(2, "0");
        const bulan = String(hariIni.getMonth() + 1).padStart(2, "0");
        const invoice = `INV${hari}${bulan}${hariIni.getFullYear()}${countPayment + 1}`;

        let originalAmountUSD = parseFloat(packageDetails.price);
        if (isNaN(originalAmountUSD) || originalAmountUSD < 0) { await session.abortTransaction(); session.endSession(); throw new Error("Package price is not a valid non-negative number.");}
        let packageDiscountAmountUSD = 0;
        let finalAmountUSD = originalAmountUSD;
        if (packageDetails.onDiscount && packageDetails.discountPrice != null && parseFloat(packageDetails.discountPrice) >= 0 && new Date(packageDetails.endDiscountDate) > new Date()) {
            const discountPriceUSD = parseFloat(packageDetails.discountPrice);
            if (!isNaN(discountPriceUSD)) { packageDiscountAmountUSD = Math.max(0, originalAmountUSD - discountPriceUSD); finalAmountUSD = discountPriceUSD; console.log(`[CreatePayment] Applied package discount. Original: ${originalAmountUSD}, Discounted: ${finalAmountUSD}`);}
        }
        let totalDiscountAmountUSD = packageDiscountAmountUSD;
        let appliedVoucherId = null;
        let voucherCodeForPolar = null;
        if (voucher_code) {
            const voucherData = await VoucherModel.findOne({ code: voucher_code, status: 'open' }).session(session);
            if (voucherData && new Date(voucherData.endDate) > new Date()) {
                console.log(`[CreatePayment] Found active voucher: ${voucherData.name} (ID: ${voucherData._id})`);
                if (!(voucherData.usageLimit !== null && voucherData.timesUsed >= voucherData.usageLimit) && !(finalAmountUSD < voucherData.minimumPurchaseAmount) && !(voucherData.packageId && voucherData.packageId.length > 0 && !voucherData.packageId.some(id => id.equals(packageDetails._id)))) {
                    let voucherDiscountUSD = 0;
                    if (voucherData.discountType === "percentage") { const discountValue = parseFloat(voucherData.discount); if (!isNaN(discountValue)) voucherDiscountUSD = (finalAmountUSD * discountValue) / 100;
                    } else { const discountValue = parseFloat(voucherData.discount); if (!isNaN(discountValue)) voucherDiscountUSD = discountValue; }
                    voucherDiscountUSD = Math.max(0, Math.min(voucherDiscountUSD, finalAmountUSD)); finalAmountUSD -= voucherDiscountUSD; totalDiscountAmountUSD += voucherDiscountUSD; appliedVoucherId = voucherData._id; voucherCodeForPolar = voucherData.code; console.log(`[CreatePayment] Applied voucher ${voucher_code}. Discount Value: ${voucherDiscountUSD} USD. New final amount: ${finalAmountUSD} USD`);
                } else { /* Logika untuk kondisi voucher tidak terpenuhi sudah ada di dalam blok if */ }
            } else { console.log(`[CreatePayment] Voucher code ${voucher_code} not found or not active/expired.`); }
        }
        finalAmountUSD = Math.max(finalAmountUSD, 0);

        const metadataForPolar = { user_id: req.user._id.toString(), package_id: packageDetails._id.toString(), invoice: invoice, original_amount_usd: originalAmountUSD.toString(), total_discount_amount_usd: totalDiscountAmountUSD.toString(), final_amount_usd_calculated: finalAmountUSD.toString(), platform: 'designrhub'};
        if (appliedVoucherId) metadataForPolar.voucher_id_internal = appliedVoucherId.toString(); if (afiliator_id) metadataForPolar.afiliator_id = afiliator_id.toString();

        let polarProductId = packageDetails.polar_product_id;
        let productPriceIdForPolar = null;

        console.log(`[CreatePayment] Initial Polar Product ID from DB: ${polarProductId}`);

        if (polarProductId) {
            try {
                console.log(`[CreatePayment] Attempting to fetch product details from Polar for Product ID: ${polarProductId}`);
                const productFromPolar = await polarService.getProduct(polarProductId);
                console.log(`[CreatePayment] Fetched from Polar for ${polarProductId}:`, JSON.stringify(productFromPolar, null, 2));

                if (productFromPolar && productFromPolar.prices && productFromPolar.prices.length > 0) {
                    productPriceIdForPolar = productFromPolar.prices[0].id;
                    console.log(`[CreatePayment] Successfully fetched active Price ID from Polar: ${productPriceIdForPolar} for Product ID: ${polarProductId}`);
                    if (JSON.stringify(packageDetails.polar_metadata) !== JSON.stringify(productFromPolar)) {
                        packageDetails.polar_metadata = productFromPolar;
                        await packageDetails.save({ session });
                        console.log(`[CreatePayment] Updated local package metadata for Product ID: ${polarProductId}.`);
                    }
                } else {
                    console.warn(`[CreatePayment] Product ${polarProductId} fetched from Polar does NOT have any prices or is invalid. Price array: ${productFromPolar?.prices}`);
                }
            } catch (err) {
                console.error(`[CreatePayment] FAILED to fetch product ${polarProductId} from Polar. Error: ${err.message}. Product might be archived/deleted or ID is incorrect.`);
                polarProductId = null; // Reset if fetching failed, to trigger creation
            }
        }
        
        if (!polarProductId || !productPriceIdForPolar) {
            console.warn(`[CreatePayment] Polar Product ID (${polarProductId}) or Price ID (${productPriceIdForPolar}) is missing or couldn't be fetched reliably. Attempting to create/ensure product in Polar for package: ${packageDetails.packageName}`);
            try {
                const newOrUpdatedPolarProduct = await polarService.createProduct(packageDetails);
                console.log(`[CreatePayment] Result of createProduct for ${packageDetails.packageName}:`, JSON.stringify(newOrUpdatedPolarProduct, null, 2));
                
                packageDetails.polar_product_id = newOrUpdatedPolarProduct.id;
                packageDetails.polar_metadata = newOrUpdatedPolarProduct;
                await packageDetails.save({ session });

                polarProductId = newOrUpdatedPolarProduct.id;
                if (newOrUpdatedPolarProduct.prices && newOrUpdatedPolarProduct.prices.length > 0) {
                    productPriceIdForPolar = newOrUpdatedPolarProduct.prices[0].id;
                    console.log(`[CreatePayment] Successfully created/ensured Polar Product ID: ${polarProductId}, and obtained Price ID: ${productPriceIdForPolar}`);
                } else {
                    console.error(`[CreatePayment] CRITICAL: Polar product ${polarProductId} was created/updated by createProduct but still has NO prices in the response.`);
                }
            } catch (productCreationError) {
                await session.abortTransaction(); session.endSession();
                console.error("[CreatePayment] Error during polarService.createProduct:", productCreationError);
                return res.status(500).json({ success: false, message: `Failed to sync package with payment provider: ${productCreationError.message}` });
            }
        }

        if (!productPriceIdForPolar) {
            await session.abortTransaction(); session.endSession();
            const errorMessage = `CRITICAL: Could not determine a valid Polar Price ID for package ${packageDetails.packageName} (Polar Product ID: ${polarProductId}). Please check product and price configuration in Polar.sh dashboard and ensure polarService.createProduct correctly creates prices.`;
            console.error(errorMessage);
            return res.status(500).json({ success: false, message: "Payment processing error: Essential pricing information from payment gateway is missing.", error: errorMessage });
        }

        const successRedirectUrl = new URL(`payment/success?checkout_id={CHECKOUT_ID}`, feBaseUrl.href).toString();
        const cancelRedirectUrl = new URL(`payment/cancelled?checkout_id={CHECKOUT_ID}`, feBaseUrl.href).toString();

        const checkoutPayloadForPolar = {
            customerEmail: req.user.email, customerName: req.user.username, customerExternalId: req.user._id.toString(),
            successUrl: successRedirectUrl, cancelUrl: cancelRedirectUrl, metadata: metadataForPolar, currency: "USD",
            products: [productPriceIdForPolar] // Array of Price ID strings
        };
        if (voucherCodeForPolar) checkoutPayloadForPolar.discountCode = voucherCodeForPolar;
        
        console.log("[CreatePayment] Final payload for Polar checkout:", JSON.stringify(checkoutPayloadForPolar, null, 2));
        const polarCheckout = await polarService.createCheckout(checkoutPayloadForPolar);

        const expiredTime = polarCheckout.expires_at ? new Date(polarCheckout.expires_at) : new Date(Date.now() + (24 * 60 * 60 * 1000));
        const newUserPayment = new PaymentModel({
            userId: req.user._id, userName: req.user.username, package_id: packageDetails._id, payment_time: Date.now(),
            expired_time: expiredTime, polar_checkout_id: polarCheckout.id, polar_product_id: polarProductId, reference: polarCheckout.id,
            admin: 0, amount: finalAmountUSD, total: originalAmountUSD, discount_amount: totalDiscountAmountUSD,
            checkout_url: polarCheckout.url, invoice, voucher_id: appliedVoucherId, afiliator_id: afiliator_id || undefined,
            polar_metadata: polarCheckout, currency: "USD"
        });
        await newUserPayment.save({ session });
        await session.commitTransaction(); session.endSession();
        console.log(`[CreatePayment] Payment record created (ID: ${newUserPayment._id}), Polar checkout URL: ${polarCheckout.url}`);
        res.status(201).json({
            success: true, message: "Checkout session created successfully with Polar", checkout_url: polarCheckout.url,
            checkout_id: polarCheckout.id, expires_at: polarCheckout.expires_at, total_amount_usd: finalAmountUSD, invoice: invoice
        });

    } catch (error) {
        await session.abortTransaction(); session.endSession();
        console.error("[CreatePayment] ❌ Outer catch - Payment creation failed:", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");
        let errorMessage = "Failed to create payment"; let errorDetails = error.message;
        if (error.message && error.message.includes("Input validation failed:") && error.message.includes("path")) { try { const match = error.message.match(/(\[[\s\S]*\])/); if (match && match[1]) { errorDetails = JSON.parse(match[1]); } } catch (parseError) { console.error("[CreatePayment] Error parsing Polar validation error detail:", parseError); }
        } else if (error.message && error.message.includes("Failed to create checkout session in Polar") && error.message.includes("detail")) { try { const jsonErrorMatch = error.message.match(/{.*}/s); if (jsonErrorMatch && jsonErrorMatch[0]) { const polarErrorDetail = JSON.parse(jsonErrorMatch[0]); errorDetails = polarErrorDetail.detail || polarErrorDetail; } } catch (parseError) { console.error("[CreatePayment] Error parsing general Polar error detail:", parseError); } }
        res.status(500).json({ success: false, message: errorMessage, error: errorDetails });
    }
};