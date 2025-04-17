const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel")
const moment = require("moment-timezone");
const { errorLogs } = require("../../utils/errorLogs");

exports.createVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { startDate, endDate, name, packageId, discount, discountType, status, code } = req.body;

        if (moment(endDate).isBefore(startDate)) {
            session.endSession();
            return res.status(400).json({ message: "endDate harus lebih besar dari startDate" });
        }

        const existingVoucher = await VoucherModel.findOne({ code }).session(session);
        if (existingVoucher) {
            session.endSession();
            return res.status(400).json({ message: "Kode voucher sudah digunakan." });
        }

        const existingPackage = await PackageModel.findById(packageId).session(session);
        if (!existingPackage) {
            session.endSession();
            return res.status(400).json({ message: "Package tidak ditemukan." });
        }

        const newVoucher = new VoucherModel({
            startDate,
            endDate,
            name,
            packageId,
            discount,
            discountType,
            status,
            code,
        });

        await newVoucher.save({ session });
        await session.commitTransaction();
        res.status(201).json({ message: "Voucher berhasil dibuat!" });

    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/voucherControllers/createVoucer.js");
        res.status(500).json({ message: "Server error", error: error.message });

    } finally {
        session.endSession();
    }
};
