const ItemModel = require("../../models/itemModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getAllItem = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const skip = (page - 1) * limit;

        let { itemName, typeId, status, sortColumn, sortOrder } = req.query;

        if (!sortColumn) sortColumn = "createdAt";
        if (!sortOrder) sortOrder = -1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        if (itemName) {
            itemName = itemName.replace("+", "").trim();
        }

        const matchCriteria = {
            ...(itemName && { itemName: { $regex: itemName, $options: "i" } }),
            ...(typeId &&
                mongoose.isValidObjectId(typeId) && {
                typeId: new mongoose.Types.ObjectId(typeId)
            }),
            ...(status === "active" || status === "inactive"
                ? { isActive: { $eq: status === "active" } }
                : {})
        };

        const result = await ItemModel.aggregate([
            { $match: matchCriteria },
            {
                $lookup: {
                    from: "types",
                    localField: "typeId",
                    foreignField: "_id",
                    as: "type"
                }
            },
            { $unwind: "$type" },
            {
                $addFields: {
                    typeName: "$type.name"
                }
            },
            {
                $sort: { [sortColumn]: sortOrder }
            },
            {
                $facet: {
                    data: [
                        {
                            $sort:
                                sortColumn === "typeName"
                                    ? { typeName: sortOrder }
                                    : { [sortColumn]: sortOrder }
                        },
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: "categories",
                                localField: "categoryId",
                                foreignField: "_id",
                                as: "category"
                            }
                        }
                    ],
                    totalItems: [{ $count: "count" }]
                }
            }
        ]);

        const data = result[0]?.data || [];
        const totalItems = result[0]?.totalItems?.[0]?.count || 0;

        return res.status(200).json({
            items: data,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page
        });
    } catch (error) {
        console.error("Controller filterAll error:", error);
        errorLogs(req, res, error, "controllers/itemControllers/getItem.js");
        res.status(500).json({ message: "Server error" });
    }
};


exports.getItemById = async (req, res) => {
    try {
        const item = await ItemModel.findById(req.params.id)
            .populate("typeId")
            .populate("categoryId");
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }
        res.json({ item });
    } catch (error) {
        errorLogs(req, res, error, "controllers/itemControllers/getItem.js");
        res.status(500).json({ message: "Server error" });
    }
};
