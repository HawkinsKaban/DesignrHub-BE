const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const TypeModel = require("../../models/typeModel");
const CategoryModel = require("../../models/categoryModel");
const { errorLogs } = require("../../utils/errorLogs");
const { upload } = require("../../middlewares/upload");


exports.updateType = async (req, res) => {
    upload.types(req, res, async (err) => {
        if (err) {
            return res
                .status(500)
                .json({ message: "File upload error", error: err.message });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const typeId = req.params.id;
            const type = await TypeModel.findById(typeId).session(session);

            if (!type) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: "Type not found" });
            }

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
                onlyVersion,
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

            const updateObject = {
                name: name || type.name,
                basePrice: basePrice || type.basePrice,
                isActive: isActive !== undefined ? isActive : type.isActive,
                status: status || type.status,
                onlyVersion: onlyVersion,
                url: url || type.url,
                targetType: targetType || type.targetType,
                note: note || type.note,
                vidio: vidio || type.vidio,
                category: category || type.category,
                categoryId: categoryId || type.categoryId,
            };

            if (req.file && req.file.filename) {
                if (type.logo) {
                    const oldFilePath = path.join(__dirname, "..", "..", "uploads", "types", type.logo);
                    try {
                        await fs.promises.access(oldFilePath);
                        await fs.promises.unlink(oldFilePath);
                        console.log("File lama berhasil dihapus:", type.logo);
                    } catch (fileErr) {
                        if (fileErr.code === "ENOENT") {
                            console.log("File lama tidak ditemukan:", type.logo);
                        } else {
                            console.error("Error saat menghapus file lama:", fileErr);
                        }
                    }
                }
                updateObject.logo = req.file.filename;
            }

            // Update dokumen di database dengan session
            const updatedType = await TypeModel.findByIdAndUpdate(typeId, updateObject, {
                new: true,
                session,
            });

            if (!updatedType) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: "Failed to update type" });
            }

            await updatedType.save({ session });

            await session.commitTransaction();
            session.endSession();

            res.status(200).json({ message: "Type updated successfully", data: updatedType });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            errorLogs(req, res, error, "controllers/typeControllers/updateType.js");
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });
};
