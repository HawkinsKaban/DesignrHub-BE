const mongoose = require("mongoose");
const PaymentModel = require("../../models/paymentModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.deletePayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { id } = req.params;
        
        const payment = await PaymentModel.findById(id).session(session);
        
        if (!payment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Payment not found" });
        }
        
        // Only allow deletion of pending payments
        if (payment.payment_status !== "pending") {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: "Only pending payments can be deleted" 
            });
        }
        
        await PaymentModel.findByIdAndDelete(id).session(session);
        
        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).json({ 
            success: true,
            message: "Payment deleted successfully" 
        });
        
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/paymentControllers/deletePayment.js");
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};