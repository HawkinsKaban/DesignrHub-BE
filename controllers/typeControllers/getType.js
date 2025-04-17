const TypeModel = require("../../models/typeModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getAllTypes = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        let { sortColumn, sortOrder, search, status } = req.query;

        if (!sortColumn) sortColumn = "createdAt";
        if (!sortOrder) sortOrder = -1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        const query = {};

        if (search) {
            query.name = {
                $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                $options: "i",
            };
        }

        if (status) {
            query.isActive = status;
        }

        const types = await TypeModel.find(query)
            .limit(limit)
            .skip(skip)
            .sort({ [sortColumn]: sortOrder });

        const totalTypes = await TypeModel.countDocuments(query);

        res.status(200).json({
            types,
            page,
            limit,
            total: totalTypes,
        });
    } catch (error) {
        errorLogs(req, res, error, "controllers/typeControllers/getTypes.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
