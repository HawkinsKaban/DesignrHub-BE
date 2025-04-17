const PackageModel = require("../../models/packageModel")
const { errorLogs } = require("../../utils/errorLogs");


exports.GetAllPackage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skip = (page - 1) * limit;

        let { search, sortColumn, sortOrder, status } = req.query;

        if (!sortColumn) sortColumn = "packageName";
        if (!sortOrder) sortOrder = 1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        const filter = {};

        if (status) {
            filter.isActive = status == "active" ? 1 : 0;
        }

        if (search) {
            filter.$or = [
                {
                    packageName: {
                        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                        $options: "i",
                    },
                },
            ];
        }

        const packages = await PackageModel.find(filter)
            .populate("categoryId")
            .limit(limit)
            .skip(skip)
            .sort({ [sortColumn]: sortOrder });

        const total = await PackageModel.countDocuments(filter);

        const totalPages = Math.ceil(total / limit);

        return res.json({ packages, total, totalPages });
    } catch (error) {
        errorLogs(req, res, error, "controllers/packageControllers/getPackage.js");
        res.status(500).json({ message: "Server error" });
    }
};

exports.GetPackageById = async (req, res) => {
    try {
        const { id } = req.params;

        const package = await PackageModel.findById(id).populate("categoryId");
        if (!package) {
            return res.status(404).json({ message: "Package not found" });
        }

        return res.json({ package });
    } catch (error) {
        errorLogs(req, res, error, "controllers/packageControllers/getPackage.js");
        res.status(500).json({ message: "Server error" });
    }
};
