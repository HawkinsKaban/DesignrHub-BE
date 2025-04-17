const mongoose = require("mongoose");
const VoucherModel = require("../../models/voucerModel");
const PackageModel = require("../../models/packageModel");
const moment = require("moment-timezone");
const { errorLogs } = require("../../utils/errorLogs");

exports.deleteVoucher = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const voucher = await VoucherModel.findByIdAndDelete(req.params.id).session(session);
        if (!voucher) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Voucher not found" });
        }
        await session.commitTransaction();
        res.json({ message: "Voucher deleted successfully" });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/voucherControllers/deleteVoucher.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
};
