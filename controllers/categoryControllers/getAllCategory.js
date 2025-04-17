const CategoryModel = require('../../models/categoryModel');
const { errorLogs } = require('../../utils/errorLogs');

exports.getAllCategory = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const skip = (page - 1) * limit;

        let { categoryName, sortColumn, sortOrder } = req.query;

        if (!sortColumn) sortColumn = "createdAt";
        if (!sortOrder) sortOrder = -1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        if (categoryName) {
            categoryName = categoryName.replace("+", "").trim();
        }

        const matchCriteria = {
            ...(categoryName && { name: { $regex: categoryName, $options: "i" } }),
        };

        const result = await CategoryModel.aggregate([
            { $match: matchCriteria },
            { $sort: { [sortColumn]: sortOrder } },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: limit }],
                    totalCount: [{ $count: "total" }]
                }
            }
        ]);

        const categories = result[0]?.data || [];
        const total = result[0]?.totalCount?.[0]?.total || 0;

        return res.status(200).json({
            success: true,
            message: categories.length > 0 ? "Kategori ditemukan" : "Kategori tidak ditemukan",
            data: categories,
            totalItems: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/categoryControllers/getAllCategory.js");
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
