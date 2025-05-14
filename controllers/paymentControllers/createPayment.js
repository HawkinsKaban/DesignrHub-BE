const mongoose = require("mongoose");
const axios = require("axios");
const { createHmac } = require("node:crypto");
const VoucherModel = require("../../models/voucerModel");
const PaymentModel = require("../../models/paymentModel");
const PackageModel = require("../../models/packageModel");
const { errorLogs } = require("../../utils/errorLogs");
const { convertUnixtoDateTime } = require("../../utils/convertDate");
require("dotenv").config();

exports.createUserPayment = async (req, res) => {
    const { package_id, method, voucher_id, afiliator_id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const package = await PackageModel.findById(package_id).session(session);
        if (!package) {
            session.endSession();
            return res.status(404).json({ message: "Package not found" })
        }

        const countPayment = await PaymentModel.countDocuments().session(session);
        const hariIni = new Date();
        const hari = String(hariIni.getDate()).padStart(2, "0");
        const bulan = String(hariIni.getMonth() + 1).padStart(2, "0");
        const merchant_ref = `INV${hari}${bulan}${hariIni.getFullYear()}${countPayment + 1}`;

        let amountTotal = package.price;

        if (voucher_id) {
            try {
                const voucherData = await VoucherModel.findById(voucher_id).session(session);
                if (voucherData) {
                    if (Array.isArray(voucherData.packageId)) {
                        const isPackageExist = voucherData.packageId.includes(package._id);
                        if (isPackageExist) {
                            if (voucherData.discountType === "percent") {
                                amountTotal -= (package.price * voucherData.discount) / 100;
                            } else {
                                amountTotal -= voucherData.discount;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching voucher:", error);
            }
        }

        const signature = createHmac("sha256", process.env.TRIPAY_PRIVATE_KEY)
            .update(process.env.TRIPAY_MERCHANT_CODE + merchant_ref + amountTotal)
            .digest("hex");

        const response = await axios.post(
            `${process.env.TRIPAY_URL}transaction/create`,
            {
                method,
                merchant_ref,
                amount: amountTotal,
                customer_name: req.user.username,
                customer_email: req.user.email,
                customer_phone: req.user.nomor || "081726534288",
                order_items: [
                    {
                        sku: "FB-06",
                        name: package.packageName,
                        price: amountTotal,
                        quantity: 1,
                        product_url: "https://domainanda.com/redirect",
                        image_url: "https://domainanda.com/redirect",
                    },
                ],
                signature,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.TRIPAY_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.data.success) {
            throw new Error("Payment gateway error: " + JSON.stringify(response.data));
        }

        const data = response.data.data;
        const newUserPayment = new PaymentModel({
            userId: req.user._id,
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

        res.status(201).json({
            msg: "Transaksi berhasil",
            checkout_url: data.checkout_url,
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("Transaction failed:", error);
        errorLogs(req, res, error.message, "controllers/paymentControllers/createPayment.js");

        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    } finally {
        session.endSession();
    }
};
