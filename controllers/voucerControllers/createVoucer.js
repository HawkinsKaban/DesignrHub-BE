const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel")
const moment = require("moment-timezone");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.createVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { startDate, endDate, name, packageId, discount, discountType, status, code } = req.body;

        if (moment(endDate).isBefore(startDate)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "endDate harus lebih besar dari startDate" });
        }

        const existingVoucher = await VoucherModel.findOne({ code }).session(session);
        if (existingVoucher) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Kode voucher sudah digunakan." });
        }

        // Validate packageId
        if (packageId) {
            const existingPackage = await PackageModel.findById(packageId).session(session);
            if (!existingPackage) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Package tidak ditemukan." });
            }
        }

        // Create voucher in database
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

        // Create voucher in Polar integration
        try {
            if (status !== 'close') {
                const polarDiscount = await polarService.createDiscount(newVoucher);
                
                // Store Polar discount ID in voucher object
                newVoucher.polar_discount_id = polarDiscount.id;
                newVoucher.polar_metadata = polarDiscount;
                await newVoucher.save({ session });
                
                console.log(`✅ Voucher synced with Polar: ${polarDiscount.id}`);
            }
        } catch (polarError) {
            console.error(`⚠️ Failed to create voucher in Polar: ${polarError.message}`);
            // Don't fail voucher creation if Polar integration fails
            // The voucher can be synced later
        }

        await session.commitTransaction();
        session.endSession();
        
        res.status(201).json({ message: "Voucher berhasil dibuat!" });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/voucherControllers/createVoucer.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};