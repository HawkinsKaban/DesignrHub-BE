const mongoose = require("mongoose");
const CategoryModel = require('../../models/categoryModel');
const { errorLogs } = require('../../utils/errorLogs');

exports.updateCategory = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { name, description, allApps } = req.body;

        const category = await CategoryModel.findById(id).session(session);
        if (!category) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Category not found" });
        }

        if (name !== undefined) category.name = name;
        if (description !== undefined) category.description = description;
        if (allApps !== undefined) category.allApps = allApps;

        await category.save({ session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            category,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error, "controllers/categoryControllers/updateCategory.js");
        return res.status(500).json({ message: "Server error" });
    }
};
