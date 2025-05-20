const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");
const polarService = require("../../services/polarService");
require("dotenv").config();

exports.createUserPayment = async (req, res) => {
    const { package_id, voucher_id, afiliator_id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Get package details
        const package = await PackageModel.findById(package_id).session(session);
        if (!package) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Package not found" });
        }

        // Generate invoice number
        const countPayment = await PaymentModel.countDocuments().session(session);
        const hariIni = new Date();
        const hari = String(hariIni.getDate()).padStart(2, "0");
        const bulan = String(hariIni.getMonth() + 1).padStart(2, "0");
        const invoice = `INV${hari}${bulan}${hariIni.getFullYear()}${countPayment + 1}`;

        // Calculate amount with discounts
        let originalAmount = package.price;
        let discountAmount = 0;
        let finalAmount = originalAmount;

        // Apply package discount if available
        if (package.onDiscount && package.discountPrice && package.endDiscountDate > new Date()) {
            const packageDiscount = originalAmount - package.discountPrice;
            discountAmount += packageDiscount;
            finalAmount = package.discountPrice;
        }

        // Apply voucher discount if provided
        let appliedVoucherId = null;
        if (voucher_id) {
            try {
                const voucherData = await VoucherModel.findById(voucher_id).session(session);
                if (voucherData && voucherData.status === 'open' && new Date(voucherData.endDate) > new Date()) {
                    if (Array.isArray(voucherData.packageId) && voucherData.packageId.includes(package._id)) {
                        if (voucherData.discountType === "percentage") {
                            const voucherDiscount = (finalAmount * parseFloat(voucherData.discount)) / 100;
                            discountAmount += voucherDiscount;
                            finalAmount -= voucherDiscount;
                        } else {
                            const voucherDiscount = parseFloat(voucherData.discount);
                            discountAmount += voucherDiscount;
                            finalAmount -= voucherDiscount;
                        }
                        appliedVoucherId = voucher_id;
                    }
                }
            } catch (error) {
                console.error("Error applying voucher:", error);
            }
        }

        // Ensure final amount is not negative
        finalAmount = Math.max(finalAmount, 0);

        // Convert to cents for Polar (assuming IDR)
        const amountInCents = polarService.convertToCents(finalAmount);
        
        // Create metadata object without any null values
        const metadata = {
            user_id: req.user._id.toString(),
            package_id: package._id.toString(),
            invoice: invoice,
            original_amount: originalAmount,
            discount_amount: discountAmount
        };

        // Only add these fields if they have values
        if (appliedVoucherId) {
            metadata.voucher_id = appliedVoucherId;
        }
        
        if (afiliator_id) {
            metadata.afiliator_id = afiliator_id.toString();
        }

        // Check if we have a Polar product ID for this package
        if (!package.polar_product_id) {
            // If not, we need to create one
            try {
                console.log("Creating Polar product for package:", package.packageName);
                const polarProduct = await polarService.createProduct(package);
                
                // Update package with the new Polar product ID
                package.polar_product_id = polarProduct.id;
                package.polar_metadata = polarProduct;
                await package.save({ session });
                
                console.log("Polar product created:", polarProduct.id);
            } catch (productError) {
                console.error("Error creating Polar product:", productError);
                throw new Error(`Failed to create Polar product: ${productError.message}`);
            }
        }

        // Get the price ID from the polar_metadata if available
        let productPriceId = null;
        if (package.polar_metadata && package.polar_metadata.prices && package.polar_metadata.prices.length > 0) {
            productPriceId = package.polar_metadata.prices[0].id;
        }

        // Prepare checkout data for Polar with correct product structure
        const checkoutData = {
            customer_email: req.user.email,
            customer_name: req.user.username,
            customer_external_id: req.user._id.toString(),
            amount: amountInCents,
            success_url: `${process.env.FE_URL}payment/success?checkout_id={CHECKOUT_ID}`,
            metadata: metadata,
            product_prices: []
        };

        // If we have a product price ID, use it
        if (package.polar_product_id && productPriceId) {
            checkoutData.product_prices = [{
                product_id: package.polar_product_id,
                price_id: productPriceId
            }];
        } else {
            // Otherwise, just use the amount directly (one-time payment)
            checkoutData.amount = amountInCents;
        }

        // Create checkout session with Polar
        const polarCheckout = await polarService.createCheckout(checkoutData);

        // Calculate expiration time (24 hours from now)
        const expiredTime = new Date();
        expiredTime.setHours(expiredTime.getHours() + 24);

        // Create payment record in our database
        const newUserPayment = new PaymentModel({
            userId: req.user._id,
            userName: req.user.username,
            package_id,
            payment_time: Date.now(),
            expired_time: expiredTime,
            polar_checkout_id: polarCheckout.id,
            reference: polarCheckout.id, // Store checkout ID as reference
            admin: 0, // Polar handles fees
            amount: finalAmount,
            total: originalAmount,
            discount_amount: discountAmount,
            checkout_url: polarCheckout.url,
            invoice,
            voucher_id: appliedVoucherId,
            afiliator_id: afiliator_id || undefined, // Use undefined instead of null
            polar_metadata: polarCheckout,
            currency: "IDR"
        });

        await newUserPayment.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: "Checkout session created successfully",
            checkout_url: polarCheckout.url,
            checkout_id: polarCheckout.id,
            expires_at: polarCheckout.expires_at,
            total_amount: finalAmount,
            invoice: invoice
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("Payment creation failed:", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");

        res.status(500).json({
            success: false,
            message: "Failed to create payment",
            error: error.message,
        });
    }
};