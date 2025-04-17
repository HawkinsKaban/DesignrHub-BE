const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel");
const moment = require("moment-timezone");
const { errorLogs } = require("../../utils/errorLogs");

exports.updateVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const voucherId = req.params.id;
        const { startDate, endDate, name, packageId, discount, discountType, status, code } = req.body;

        if (moment(endDate).isBefore(startDate)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "endDate harus lebih besar dari startDate" });
        }

        const existingVoucher = await VoucherModel.findById(voucherId).session(session);
        if (!existingVoucher) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Voucher tidak ditemukan." });
        }

        if (code && code !== existingVoucher.code) {
            const existingCode = await VoucherModel.findOne({ code }).session(session);
            if (existingCode) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Kode voucher sudah digunakan." });
            }
        }

        if (packageId) {
            const existingPackage = await PackageModel.findById(packageId).session(session);
            if (!existingPackage) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Package tidak ditemukan." });
            }
        }

        const updatedVoucher = await VoucherModel.findByIdAndUpdate(
            voucherId,
            {
                startDate: startDate || existingVoucher.startDate,
                endDate: endDate || existingVoucher.endDate,
                name: name || existingVoucher.name,
                packageId: packageId || existingVoucher.packageId,
                discount: discount || existingVoucher.discount,
                discountType: discountType || existingVoucher.discountType,
                status: status !== undefined ? status : existingVoucher.status,
                code: code || existingVoucher.code,
            },
            { new: true, session }
        );

        if (!updatedVoucher) {
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({ message: "Gagal memperbarui voucher." });
        }

        await session.commitTransaction();
        res.status(200).json({ message: "Voucher berhasil diperbarui!", data: updatedVoucher });

    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/voucherControllers/updateVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });

    } finally {
        session.endSession();
    }
};
