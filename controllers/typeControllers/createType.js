const mongoose = require("mongoose");

const TypeModel = require("../../models/typeModel");
const CategoryModel = require("../../models/categoryModel");
const { errorLogs } = require("../../utils/errorLogs");
const { upload } = require("../../middlewares/upload");

exports.createType = async (req, res) => {
    upload.types(req, res, async (err) => {
        if (err) {
            return res
                .status(500)
                .json({ message: "File upload error", error: err.message });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const {
                name,
                status,
                basePrice,
                url,
                targetType,
                note,
                vidio,
                category,
                isActive,
            } = req.body;

            const categoryId = Array.isArray(req.body.categoryId)
                ? req.body.categoryId
                : [req.body.categoryId];

            const categoryExist = await CategoryModel.find({
                _id: { $in: categoryId },
            }).session(session);

            if (categoryExist.length !== categoryId.length) {
                await session.abortTransaction();
                session.endSession();

                return res.status(400).json({ message: "Category not found" });
            }

            if (!req.file) {
                await session.abortTransaction();
                session.endSession();

                return res.status(400).json({ message: "File is required" });
            }

            const newType = new TypeModel({
                name,
                basePrice,
                isActive: isActive !== undefined ? Boolean(isActive) : true,
                status,
                logo: req.file.filename, // nama file disimpan di field 'logo'
                targetType,
                url,
                note,
                vidio,
                category,
                categoryId,
            });

            await newType.save({ session });

            await session.commitTransaction();
            session.endSession();

            return res.status(201).json({ message: "Type created successfully", data: newType });
        } catch (error) {
            await session.abortTransaction();
            console.log(error);
            session.endSession();
            errorLogs(req, res, error, "controllers/typeControllers/createType.js");
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    });
};
