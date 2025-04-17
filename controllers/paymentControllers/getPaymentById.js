const PaymentModel = require("../../models/paymentModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getPaymentById = async (req, res) => {
    try {
        const { id } = req.params;
        const payment = await PaymentModel.findById(id)
            .populate("userId")
            .populate("package_id")
            .populate("voucher_id")
            .lean();

        if (!payment) {
            return res.status(404).json({ message: "Payment not found" });
        }

        return res.status(200).json({ payment });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/getPaymentById.js");
        return res.status(500).json({ message: "Internal server error" });
    }
};
