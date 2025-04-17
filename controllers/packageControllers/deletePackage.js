const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");

const { errorLogs } = require("../../utils/errorLogs");


exports.deletePackage = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;

        const existingPackage = await PackageModel.findById(id).session(session);
        if (!existingPackage) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Package dengan id ${id} tidak ditemukan` });
        }

        const isCategoryExist = await CategoryModel.findById(existingPackage.categoryId).session(session);
        if (isCategoryExist) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Package dengan id ${id} tidak bisa dihapus karena terdapat category yang menggunakan package ini` });
        }

        const deletedPackage = await PackageModel.findByIdAndDelete(id).session(session);

        await session.commitTransaction();

        res.status(200).json({
            message: "Package berhasil dihapus!",
            package: deletedPackage,
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/packageControllers/deletePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
};
