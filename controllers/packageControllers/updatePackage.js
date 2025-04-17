const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel");
const CategoryModel = require("../../models/categoryModel");

const { errorLogs } = require("../../utils/errorLogs");

exports.updatePackage = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

        const existingPackage = await PackageModel.findById(id).session(session);
        if (!existingPackage) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Package dengan id ${id} tidak ditemukan` });
        }

        const existingCategory = await CategoryModel.findById(categoryId).session(session);
        if (!existingCategory) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: `Category dengan id ${categoryId} tidak ditemukan` });
        }

        const updatePackage = {
            packageName,
            price,
            discountPrice,
            durationName,
            durationInDays,
            categoryId: existingCategory._id,
            onDiscount,
            endDiscountDate,
            isActive,
            priority,
        };

        await PackageModel.findByIdAndUpdate(id, updatePackage, { session });

        await session.commitTransaction();
        res.status(201).json({
            message: "Package berhasil diupdate!",
            package: updatePackage,
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/packageControllers/updatePackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
};
