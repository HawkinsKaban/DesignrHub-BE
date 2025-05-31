// controllers/voucerControllers/deleteVoucher.js
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
        
        let polarAction = "none";
        let polarMessage = "";

        if (voucher.polar_discount_id) {
            try {
                await polarService.deleteDiscount(voucher.polar_discount_id); // Menggunakan deleteDiscount
                polarAction = "deleted";
                polarMessage = `Voucher (Polar ID: ${voucher.polar_discount_id}) deleted from Polar.sh.`;
                console.log(`[DeleteVoucherCtrl] ✅ ${polarMessage}`);
            } catch (polarError) {
                polarAction = "delete_failed";
                polarMessage = `Failed to delete voucher from Polar.sh (Polar ID: ${voucher.polar_discount_id}): ${polarError.message}. Local voucher will still be deleted.`;
                console.error(`[DeleteVoucherCtrl] ⚠️ ${polarMessage}`);
                errorLogs(req, null, `Polar delete failed for voucher ${voucher.name}: ${polarError.message}`, "controllers/voucerControllers/deleteVoucher.js (Polar Delete)");
                // Tidak menghentikan transaksi, voucher lokal tetap dihapus
            }
        } else {
            polarMessage = "No Polar discount ID found, no action taken on Polar.sh.";
            console.log(`[DeleteVoucherCtrl] ${polarMessage}`);
        }
        
        await VoucherModel.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();
        session.endSession();
        
        res.json({ 
            message: "Voucher deleted successfully from local database.",
            polar_action: polarAction,
            polar_message: polarMessage
        });
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        errorLogs(req, res, error.message, "controllers/voucherControllers/deleteVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};