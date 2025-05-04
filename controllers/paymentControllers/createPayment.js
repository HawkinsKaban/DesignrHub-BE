const mongoose = require("mongoose");
const axios = require("axios");
const { createHmac } = require("node:crypto");
const VoucherModel = require("../../models/voucerModel");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");
const { convertUnixtoDateTime } = require("../../utils/convertDate");
require("dotenv").config();

exports.createUserPayment = async (req, res) => {
    const { package_id, method, voucher_id, afiliator_id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Validate input data
        if (!package_id || !method) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Package ID and payment method are required" });
        }

        // Check if payment method is valid
        const validMethods = ["OVO", "QRIS", "BNIVA", "BCAVA", "MANDIRIVA", "BRIVA", 
                            "PERMATAVA", "CIMBVA", "MYBVA", "OTHERBANKVA", "BSIVA", 
                            "ALFAMART", "INDOMARET", "DANA", "SHOPEEPAY"];
        if (!validMethods.includes(method)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Invalid payment method" });
        }

        // Check if package exists
        const package = await PackageModel.findById(package_id).session(session);
        if (!package) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Package not found" });
        }

        // Check if user already has a pending payment for this package
        const existingPendingPayment = await PaymentModel.findOne({
            userId: req.user._id,
            package_id: package_id,
            payment_status: "pending"
        }).session(session);

        if (existingPendingPayment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: "You already have a pending payment for this package",
                checkout_url: existingPendingPayment.checkout_url
            });
        }

        // Generate invoice number
        const countPayment = await PaymentModel.countDocuments().session(session);
        const today = new Date();
        const day = String(today.getDate()).padStart(2, "0");
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const merchant_ref = `INV${day}${month}${today.getFullYear()}${countPayment + 1}`;

        let amountTotal = package.price;

        // Apply voucher if provided
        if (voucher_id) {
            try {
                const voucherData = await VoucherModel.findById(voucher_id).session(session);
                
                if (!voucherData) {
                    await session.abortTransaction();
                    session.endSession();
                    return res.status(404).json({ message: "Voucher not found" });
                }
                
                // Check if voucher is valid for this package
                if (Array.isArray(voucherData.packageId)) {
                    const isPackageExist = voucherData.packageId.some(id => 
                        id.toString() === package._id.toString()
                    );
                    
                    if (!isPackageExist) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ message: "Voucher is not valid for this package" });
                    }
                    
                    // Check if voucher is still active
                    const now = new Date();
                    if (now < new Date(voucherData.startDate) || now > new Date(voucherData.endDate)) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ message: "Voucher is expired or not yet active" });
                    }
                    
                    // Apply discount
                    if (voucherData.discountType === "percentage") {
                        amountTotal -= (package.price * voucherData.discount) / 100;
                    } else {
                        amountTotal -= voucherData.discount;
                    }
                    
                    // Ensure amount is not negative
                    if (amountTotal < 0) amountTotal = 0;
                }
            } catch (error) {
                await session.abortTransaction();
                session.endSession();
                errorLogs(req, res, error, "controllers/paymentControllers/createPayment.js");
                return res.status(500).json({ message: "Error processing voucher", error: error.message });
            }
        }

        // Create signature for Tripay
        const signature = createHmac("sha256", process.env.TRIPAY_PRIVATE_KEY)
            .update(process.env.TRIPAY_MERCHANT_CODE + merchant_ref + amountTotal)
            .digest("hex");

        // Create payment request with Tripay
        try {
            const response = await axios.post(
                `${process.env.TRIPAY_URL}transaction/create`,
                {
                    method,
                    merchant_ref,
                    amount: amountTotal,
                    customer_name: req.user.username,
                    customer_email: req.user.email,
                    customer_phone: req.user.nomor || "081234567890",
                    order_items: [
                        {
                            sku: `PKG-${package._id.toString().substring(0, 8)}`,
                            name: package.packageName,
                            price: amountTotal,
                            quantity: 1,
                            product_url: `${process.env.FE_URL}packages/${package._id}`,
                            image_url: `${process.env.FE_URL}logo.png`,
                        },
                    ],
                    signature,
                    expired_time: 24, // 24 hours expiry
                    return_url: `${process.env.FE_URL}dashboard/subscription`,
                    callback_url: `${process.env.BE_URL}be/api/payments/callback`,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.TRIPAY_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.data.success) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ 
                    message: "Payment gateway error", 
                    details: response.data.message 
                });
            }

            const data = response.data.data;
            
            // Create payment record in database
            const newUserPayment = new PaymentModel({
                userId: req.user._id,
                userName: req.user.username,
                invoice: merchant_ref,
                package_id,
                payment_time: Date.now(),
                expired_time: convertUnixtoDateTime(data.expired_time),
                method,
                reference: data.reference,
                admin: data.fee_customer,
                amount: data.amount_received,
                total: data.amount,
                checkout_url: data.checkout_url,
                payment_name: data.payment_name,
                voucher_id,
                afiliator_id,
            });

            await newUserPayment.save({ session });
            await session.commitTransaction();
            session.endSession();

            return res.status(201).json({
                success: true,
                message: "Payment created successfully",
                data: {
                    checkout_url: data.checkout_url,
                    reference: data.reference,
                    payment_method: data.payment_name,
                    amount: data.amount,
                    expired_time: convertUnixtoDateTime(data.expired_time)
                }
            });
            
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            errorLogs(req, res, error, "controllers/paymentControllers/createPayment.js");
            return res.status(500).json({
                message: "Payment gateway error",
                error: error.message,
            });
        }
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");
        return res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};