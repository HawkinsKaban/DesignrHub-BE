const PaymentModel = require("../../models/paymentModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getAllPayment = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 15;
        let {
            package_id,
            payment_status,
            search,
            sortColumn,
            sortOrder,
            start,
            to,
            voucher_id,
            cursor
        } = req.query;

        let query = {};

        if (package_id) query.package_id = package_id;
        if (payment_status) query.payment_status = payment_status;
        if (voucher_id) query.voucher_id = voucher_id;

        if (start && to) {
            query.payment_time = { $gte: new Date(start), $lte: new Date(to) };
        }

        if (cursor) {
            query.payment_time = { ...query.payment_time, $lt: new Date(cursor) };
        }

        if (search) {
            query.$or = [
                { userName: { $regex: search, $options: "i" } },
                { invoice: { $regex: search, $options: "i" } },
                { polar_checkout_id: { $regex: search, $options: "i" } },
                { polar_order_id: { $regex: search, $options: "i" } },
            ];
        }

        let sortQuery = {};
        if (sortColumn && sortOrder) {
            sortQuery[sortColumn] = sortOrder === "desc" ? -1 : 1;
        } else {
            sortQuery["payment_time"] = -1;
        }

        const payments = await PaymentModel.find(query)
            .populate("userId", "nama username email")
            .populate("package_id", "packageName price")
            .populate("voucher_id", "code discount")
            .select("userId userName package_id payment_status payment_time amount total discount_amount invoice polar_checkout_id polar_order_id currency")
            .sort(sortQuery)
            .limit(limit)
            .lean();

        const nextCursor = payments.length > 0 ? payments[payments.length - 1].payment_time : null;

        // Format the response to include additional Polar-specific fields
        const formattedPayments = payments.map(payment => ({
            ...payment,
            checkout_method: payment.polar_checkout_id ? 'polar' : 'legacy',
            final_amount: payment.total - (payment.discount_amount || 0)
        }));

        res.status(200).json({ 
            success: true,
            payments: formattedPayments, 
            nextCursor,
            total: payments.length
        });
    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/getAllPayment.js");
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch payments", 
            error: error.message 
        });
    }
};