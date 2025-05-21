const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");
const polarService = require("../../services/polarService");
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

        // Check if package is associated with a category
        const isCategoryExist = await CategoryModel.findById(existingPackage.categoryId).session(session);
        if (isCategoryExist) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Package dengan id ${id} tidak bisa dihapus karena terdapat category yang menggunakan package ini` });
        }

        // Archive product in Polar if it exists
        if (existingPackage.polar_product_id) {
            try {
                await polarService.archiveProduct(existingPackage.polar_product_id);
                console.log(`✅ Package archived in Polar: ${existingPackage.packageName} (ID: ${existingPackage.polar_product_id})`);
            } catch (polarError) {
                console.error(`⚠️ Failed to archive package in Polar: ${polarError.message}`);
                // Don't fail the package deletion if Polar archival fails
            }
        }

        // Delete package from database
        const deletedPackage = await PackageModel.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: "Package berhasil dihapus!",
            package: deletedPackage,
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, error.message, "controllers/packageControllers/deletePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};