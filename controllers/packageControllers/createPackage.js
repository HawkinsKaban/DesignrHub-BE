const mongoose = require("mongoose");
const PackageModel = require("../../models/packageModel")
const categorModel = require("../../models/categoryModel")

const { errorLogs } = require("../../utils/errorLogs");

exports.createPackage = async (req, res) => {
    const { packageName, price, discountPrice, durationName, durationInDays, categoryId, onDiscount, endDiscountDate, isActive, priority } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        if (!packageName || !price || !durationName || !durationInDays) {
            session.endSession();
            return res.status(400).json({ message: "Semua field harus di isi" });
        }
        const existingPackage = await PackageModel.findOne({ packageName }).session(session);
        if (existingPackage) {
            session.endSession();
            return res.status(400).json({ message: `package dengan packageName ${packageName} sudah ada` });
        }
        const existingCategory = await categorModel.findById(categoryId).session(session);
        if (existingCategory) {
            const newPackage = new PackageModel({
                packageName,
                price,
                discountPrice,
                durationName,
                durationInDays,
                categoryId: existingCategory._id,
                onDiscount,
                endDiscountDate,
                isActive,
                priority
            });

            await newPackage.save({ session });
            await session.commitTransaction();
            res.status(201).json({
                message: "Package berhasil dibuat!",
                package: newPackage
            });

        } else {
            const newPackage = new PackageModel({
                packageName,
                price,
                discountPrice,
                durationName,
                durationInDays,
                onDiscount,
                endDiscountDate,
                isActive,
                priority
            });

            await newPackage.save({ session });
            await session.commitTransaction();
            res.status(201).json({
                message: "Package berhasil dibuat!",
                package: newPackage
            });
        }

    } catch (error) {
        await session.abortTransaction();
        console.log(error)
        errorLogs(req, res, error.message, "controllers/packageControllers/createPackage.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
}
