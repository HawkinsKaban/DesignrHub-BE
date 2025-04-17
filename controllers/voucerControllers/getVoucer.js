const VoucherModel = require("../../models/voucerModel");
const { errorLogs } = require("../../utils/errorLogs");


exports.getAllVoucer = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        let { search, sortColumn, sortOrder, status } = req.query;

        if (!sortColumn) sortColumn = "createdAt";
        if (!sortOrder) sortOrder = -1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        const filter = {
            isArchived: false,
        };

        if (status) {
            filter.status = status;
        }

        if (search) {
            filter.$or = [
                {
                    name: {
                        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                        $options: "i",
                    },
                },
                {
                    code: {
                        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                        $options: "i",
                    },
                },
            ];
        }

        const vouchers = await VoucherModel.find(filter)
            .populate("packageId")
            .limit(limit)
            .skip(skip)
            .sort({ [sortColumn]: sortOrder });

        const total = await VoucherModel.countDocuments(filter);

        const totalPages = Math.ceil(total / limit);

        return res.json({ vouchers, total, totalPages });
    } catch (error) {
        console.log("error", error);
        errorLogs(req, res, error, "controllers/voucherControllers/getVoucer.js");
        res.status(500).json({ message: "server error" });
    }
};
