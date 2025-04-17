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
            ];
        }

        let sortQuery = {};
        if (sortColumn && sortOrder) {
            sortQuery[sortColumn] = sortOrder === "desc" ? -1 : 1;
        } else {
            sortQuery["payment_time"] = -1;
        }

        const payments = await PaymentModel.find(query)
            .populate("userId", "nama username")
            .populate("package_id", "name price")
            .populate("voucher_id", "code discount")
            .select("userId userName package_id payment_status payment_time amount method invoice")
            .sort(sortQuery)
            .limit(limit)
            .lean();

        const nextCursor = payments.length > 0 ? payments[payments.length - 1].payment_time : null;

        res.status(200).json({ payments, nextCursor });
    } catch (error) {
        errorLogs(req, res, error.message, "controllers/paymentControllers/getAllPayment.js");
        res.status(500).json({ message: "Terjadi kesalahan", error: error.message });
    }
};
