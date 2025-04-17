const mongoose = require("mongoose");
const CategoryModel = require('../../models/categoryModel');
const { errorLogs } = require('../../utils/errorLogs');

exports.deleteCategory = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;

        const category = await CategoryModel.findById(id).session(session);
        if (!category) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Category not found" });
        }

        await CategoryModel.deleteOne({ _id: id }).session(session);

        await session.commitTransaction();
        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error, "controllers/categoryControllers/deleteCategory.js");
        return res.status(500).json({ message: "Server error" });
    } finally {
        session.endSession();
    }
};
