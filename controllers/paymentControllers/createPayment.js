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

        // --- FE_URL Validation (same as before) ---
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
        console.log(`[CreatePayment] Package found: ${packageDetails.packageName}, DB Polar Product ID: ${packageDetails.polar_product_id}`);


        // --- Invoice and Discount Calculation (same as before) ---
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
                } else { console.log(`[CreatePayment] Voucher ${voucher_code} conditions not met.`); }
            } else { console.log(`[CreatePayment] Voucher code ${voucher_code} not found or not active/expired.`); }
        }
        finalAmountUSD = Math.max(finalAmountUSD, 0);

        const metadataForPolar = { user_id: req.user._id.toString(), package_id: packageDetails._id.toString(), invoice: invoice, original_amount_usd: originalAmountUSD.toString(), total_discount_amount_usd: totalDiscountAmountUSD.toString(), final_amount_usd_calculated: finalAmountUSD.toString(), platform: 'designrhub'};
        if (appliedVoucherId) metadataForPolar.voucher_id_internal = appliedVoucherId.toString(); if (afiliator_id) metadataForPolar.afiliator_id = afiliator_id.toString();

        // --- Polar Product and Price Handling ---
        let currentPolarProductId = packageDetails.polar_product_id;
        let productPriceIdForPolar = null;
        let productNeedsCreation = !currentPolarProductId; // Assume creation if no ID initially

        if (currentPolarProductId) {
            try {
                console.log(`[CreatePayment] Attempting to fetch product details from Polar for Product ID: ${currentPolarProductId}`);
                const productFromPolar = await polarService.getProduct(currentPolarProductId);

                if (productFromPolar) { // Product found in Polar
                    const targetInterval = packageDetails.durationInDays <= 31 ? 'month' : (packageDetails.durationInDays <= 366 ? 'year' : 'month');
                    const suitablePrice = productFromPolar.prices?.find(p =>
                        !p.isArchived &&
                        p.type === 'recurring' &&
                        p.recurring_interval === targetInterval &&
                        p.price_amount > 0 // Ensure it's a paid price
                    );

                    if (suitablePrice) {
                        productPriceIdForPolar = suitablePrice.id;
                        console.log(`[CreatePayment] Found suitable Price ID from existing Polar Product: ${productPriceIdForPolar}`);
                        if (JSON.stringify(packageDetails.polar_metadata) !== JSON.stringify(productFromPolar)) {
                            packageDetails.polar_metadata = productFromPolar;
                        }
                        productNeedsCreation = false; // Found existing product and price
                    } else {
                        console.warn(`[CreatePayment] Product ${currentPolarProductId} found, but no suitable price. Will attempt to update product to add/fix price.`);
                        // We will try to update this product to ensure it has the correct price.
                        // If update fails due to the "Expected object, received string" error, then we'll create a new one.
                         productNeedsCreation = true; // Mark for update, then potentially creation
                    }
                } else { // Product not found by getProduct (returned null)
                    console.warn(`[CreatePayment] Product ${currentPolarProductId} not found in Polar. Will create a new one.`);
                    productNeedsCreation = true;
                    packageDetails.polar_product_id = null; // Clear the old, non-existent ID
                }
            } catch (err) {
                console.error(`[CreatePayment] Error fetching/validating product ${currentPolarProductId} from Polar: ${err.message}.`);
                if (err.message.includes("Expected object, received string") || err.message.includes("not found")) {
                    console.warn(`[CreatePayment] Problematic Polar Product ID ${currentPolarProductId}. Will force creation of a new product.`);
                    productNeedsCreation = true;
                    packageDetails.polar_product_id = null; // Clear the problematic ID
                } else {
                    // For other errors, rethrow or handle as fatal, as it might not be recoverable by creating a new product.
                    throw err;
                }
            }
        }

        if (productNeedsCreation) {
            try {
                let newOrUpdatedPolarProduct;
                if (packageDetails.polar_product_id) { // This implies we had an ID, but price was unsuitable or getProduct failed mildly
                    console.log(`[CreatePayment] Attempting to UPDATE existing Polar product ${packageDetails.polar_product_id} to ensure correct price.`);
                    newOrUpdatedPolarProduct = await polarService.updateProduct(packageDetails.polar_product_id, packageDetails);
                } else { // No current valid polar_product_id, so create anew
                    console.log(`[CreatePayment] Attempting to CREATE new Polar product for package: ${packageDetails.packageName}`);
                    newOrUpdatedPolarProduct = await polarService.createProduct(packageDetails);
                }

                console.log(`[CreatePayment] Result of Polar product sync (create/update):`, JSON.stringify(newOrUpdatedPolarProduct, null, 2));
                packageDetails.polar_product_id = newOrUpdatedPolarProduct.id;
                packageDetails.polar_metadata = newOrUpdatedPolarProduct;

                const targetInterval = packageDetails.durationInDays <= 31 ? 'month' : (packageDetails.durationInDays <= 366 ? 'year' : 'month');
                const suitablePrice = newOrUpdatedPolarProduct.prices?.find(p =>
                    !p.isArchived &&
                    p.type === 'recurring' &&
                    p.recurring_interval === targetInterval &&
                    p.price_amount > 0
                );

                if (suitablePrice) {
                    productPriceIdForPolar = suitablePrice.id;
                    console.log(`[CreatePayment] Successfully obtained Price ID after sync: ${productPriceIdForPolar}`);
                } else {
                    throw new Error(`CRITICAL: Polar product ${newOrUpdatedPolarProduct.id} synced but has NO suitable paid recurring price.`);
                }
            } catch (syncError) {
                 console.error(`[CreatePayment] Error during product sync (create/update): ${syncError.message}`);
                 // If update failed on the original problematic ID again with "Expected object, received string",
                 // then we must absolutely try to create a new one if we haven't already.
                 if (syncError.message.includes("Expected object, received string") && packageDetails.polar_product_id === currentPolarProductId) {
                     console.warn(`[CreatePayment] Update failed for problematic ID ${currentPolarProductId}. Forcing creation of NEW product.`);
                     packageDetails.polar_product_id = null; // Ensure createProduct is called next if this path is re-entered or in a retry
                     // This error is now thrown up to the main catch block for createUserPayment
                 }
                throw new Error(`Failed to sync package with payment provider: ${syncError.message}`);
            }
        }
        
        // Save packageDetails if polar_product_id or metadata changed.
        if (packageDetails.isModified('polar_product_id') || packageDetails.isModified('polar_metadata')) {
            await packageDetails.save({ session });
            console.log(`[CreatePayment] Saved updated packageDetails for ${packageDetails.packageName} to DB.`);
        }


        if (!productPriceIdForPolar) {
            // This should ideally not be reached if the logic above is correct.
            const finalErrorMessage = `CRITICAL FINAL: Could not determine a valid Polar Price ID for package ${packageDetails.packageName} (Polar Product ID: ${packageDetails.polar_product_id}). Aborting.`;
            console.error(finalErrorMessage);
            errorLogs(req, res, finalErrorMessage, "controllers/paymentControllers/createPayment.js (Price ID Missing Final Check)");
            // Do not abort session here, let main catch handle it
            throw new Error("Payment processing error: Essential pricing information from payment gateway is missing.");
        }

        // --- Polar Checkout Creation (same as before, using 'lineItems') ---
        const successRedirectUrl = new URL(`payment/success?checkout_id={CHECKOUT_ID}`, feBaseUrl.href).toString();
        const cancelRedirectUrl = new URL(`payment/cancelled?checkout_id={CHECKOUT_ID}`, feBaseUrl.href).toString();

        const checkoutPayloadForPolar = {
            customerEmail: req.user.email, customerName: req.user.username, customerExternalId: req.user._id.toString(),
            successUrl: successRedirectUrl, cancelUrl: cancelRedirectUrl, metadata: metadataForPolar, currency: "USD",
            lineItems: [{ price_id: productPriceIdForPolar, quantity: 1 }]
        };
        if (voucherCodeForPolar) checkoutPayloadForPolar.discountCode = voucherCodeForPolar;
        
        console.log("[CreatePayment] Final payload for Polar checkout:", JSON.stringify(checkoutPayloadForPolar, null, 2));
        const polarCheckout = await polarService.createCheckout(checkoutPayloadForPolar);

        // --- Payment Record Creation (same as before) ---
        const expiredTime = polarCheckout.expires_at ? new Date(polarCheckout.expires_at) : new Date(Date.now() + (24 * 60 * 60 * 1000));
        const newUserPayment = new PaymentModel({
            userId: req.user._id, userName: req.user.username, package_id: packageDetails._id, payment_time: Date.now(),
            expired_time: expiredTime, polar_checkout_id: polarCheckout.id, polar_product_id: packageDetails.polar_product_id, reference: polarCheckout.id,
            admin: 0, amount: finalAmountUSD, total: originalAmountUSD, discount_amount: totalDiscountAmountUSD,
            checkout_url: polarCheckout.url, invoice, voucher_id: appliedVoucherId, afiliator_id: afiliator_id || undefined,
            polar_metadata: polarCheckout, currency: "USD"
        });
        await newUserPayment.save({ session });
        
        await session.commitTransaction();
        console.log(`[CreatePayment] Payment record created (ID: ${newUserPayment._id}), Polar checkout URL: ${polarCheckout.url}`);
        res.status(201).json({
            success: true, message: "Checkout session created successfully with Polar", checkout_url: polarCheckout.url,
            checkout_id: polarCheckout.id, expires_at: polarCheckout.expires_at, total_amount_usd: finalAmountUSD, invoice: invoice
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("[CreatePayment] ❌ Outer catch - Payment creation failed:", error.message, error.stack);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");
        
        let errorDetails = error.message;
        if (error.response && error.response.data && error.response.data.detail) {
             if (Array.isArray(error.response.data.detail) && error.response.data.detail.length > 0 && error.response.data.detail[0].msg) {
                errorDetails = error.response.data.detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join('; ');
            } else if (typeof error.response.data.detail === 'string') {
                errorDetails = error.response.data.detail;
            }
        }
        res.status(500).json({ success: false, message: "Failed to create payment", error: errorDetails });

    } finally {
        session.endSession();
    }
};