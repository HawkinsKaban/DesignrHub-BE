const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel");
const moment = require("moment-timezone");
const polarService = require("../../services/polarService");
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

        // Sync with Polar if discount ID exists
        if (existingVoucher.polar_discount_id) {
            try {
                const polarDiscount = await polarService.updateDiscount(
                    existingVoucher.polar_discount_id, 
                    updatedVoucher
                );
                
                updatedVoucher.polar_metadata = polarDiscount;
                await updatedVoucher.save({ session });
                
                console.log(`✅ Voucher updated in Polar: ${name} (ID: ${polarDiscount.id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to update voucher in Polar: ${polarError.message}`);
                // Don't fail voucher update if Polar sync fails
            }
        } 
        // Create new Polar discount if it doesn't exist and voucher is active
        else if (status === 'open' || !status) {
            try {
                const polarDiscount = await polarService.createDiscount(updatedVoucher);
                
                updatedVoucher.polar_discount_id = polarDiscount.id;
                updatedVoucher.polar_metadata = polarDiscount;
                await updatedVoucher.save({ session });
                
                console.log(`✅ Voucher created in Polar: ${name} (ID: ${polarDiscount.id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to create voucher in Polar: ${polarError.message}`);
                // Don't fail voucher update if Polar creation fails
            }
        }
        // Archive Polar discount if voucher is no longer active
        else if (status === 'close' && existingVoucher.polar_discount_id) {
            try {
                await polarService.archiveDiscount(existingVoucher.polar_discount_id);
                console.log(`✅ Voucher archived in Polar: ${name} (ID: ${existingVoucher.polar_discount_id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to archive voucher in Polar: ${polarError.message}`);
                // Don't fail voucher update if Polar archival fails
            }
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: "Voucher berhasil diperbarui!", data: updatedVoucher });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/voucherControllers/updateVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};