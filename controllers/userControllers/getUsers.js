const mongoose = require("mongoose");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const skipIndex = (page - 1) * limit;

        let { sortColumn, sortOrder, status, search, premiumAccess } = req.query;

        if (!sortColumn) sortColumn = "createdAt";
        if (!sortOrder) sortOrder = -1;
        else sortOrder = sortOrder === "asc" ? 1 : -1;

        const filter = {};

        if (status) {
            filter.status = status;
        }

        if (premiumAccess) {
            filter.premiumAccess = premiumAccess;
        }

        if (search) {
            const objectIdCondition = mongoose.Types.ObjectId.isValid(search)
                ? { _id: search }
                : null;

            const queryConditions = [
                {
                    username: {
                        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                        $options: "i",
                    },
                },
                {
                    email: {
                        $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                        $options: "i",
                    },
                },
            ];

            if (objectIdCondition) {
                filter._id = objectIdCondition._id;
            } else {
                filter.$or = queryConditions;
            }
        }

        const users = await UserModel.find(filter)
            .select("-password")
            .populate("subscriptionPackage", "packageName",)
            .limit(limit)
            .skip(skipIndex)
            .sort({ [sortColumn]: sortOrder });

        const total = await UserModel.countDocuments(filter);

        const totalPages = Math.ceil(total / limit);

        res.json({ users, total, totalPages });
    } catch (error) {
        errorLogs(req, res, error, "controllers/userControllers/getAllUsers.js");
        res.status(500).send("Server Error");
    }
};


exports.getUserById = async (req, res) => {
    try {
        const user = await UserModel.findById(req.params.id)
            .select("-password")
            .populate("activePackage.packageId", "packageName");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);
    } catch (err) {
        errorLogs(req, res, err, "controllers/userControllers/getUserById.js");
        res.status(500).send("Server Error");
    }
};
