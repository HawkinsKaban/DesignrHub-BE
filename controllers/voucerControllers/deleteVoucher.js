const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const polarService = require("../../services/polarService");
const { errorLogs } = require("../../utils/errorLogs");

exports.deleteVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const voucher = await VoucherModel.findById(req.params.id).session(session);
        
        if (!voucher) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Voucher not found" });
        }
        
        // Archive discount in Polar if it exists
        if (voucher.polar_discount_id) {
            try {
                await polarService.archiveDiscount(voucher.polar_discount_id);
                console.log(`✅ Voucher archived in Polar: ${voucher.name} (ID: ${voucher.polar_discount_id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to archive voucher in Polar: ${polarError.message}`);
                // Don't fail the voucher deletion if Polar archival fails
            }
        }
        
        // Delete voucher from database
        await VoucherModel.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();
        session.endSession();
        
        res.json({ message: "Voucher deleted successfully" });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/voucherControllers/deleteVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};