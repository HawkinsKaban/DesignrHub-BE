const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const ItemModel = require("../../models/itemModel");
const TypeModel = require("../../models/typeModel");
const { errorLogs } = require("../../utils/errorLogs");
const { upload } = require("../../middlewares/upload");

exports.createItem = (req, res) => {
    upload.jsonFile(req, res, async (err) => {
        if (err) {
            return res
                .status(500)
                .json({ message: "File upload error", error: err.message });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const {
                itemName,
                description,
                status,
                endDate,
                username,
                password,
                pin,
                typeId,
                url
            } = req.body;

            let json = { cookies: null };
            let filePath = null;

            if (req.file) {
                try {
                    // Gunakan path asli dari multer
                    filePath = req.file.path;

                    // Baca file JSON
                    const fileData = fs.readFileSync(filePath, "utf8");
                    json = JSON.parse(fileData);
                } catch (parseError) {
                    if (filePath) fs.unlinkSync(filePath); // Hapus file jika parse gagal
                    await session.abortTransaction();
                    session.endSession();
                    return res
                        .status(400)
                        .json({ message: "Invalid JSON file", error: parseError.message });
                }
            }

            const { cookies } = json;

            // Pastikan typeId valid
            const type = await TypeModel.findById(typeId).session(session);
            if (!type) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ message: "Type tidak ditemukan." });
            }

            const newItem = new ItemModel({
                itemName,
                description,
                cookies,
                status: status !== undefined ? status === "true" : true,
                expirationDate: endDate,
                username,
                password,
                pin,
                typeId,
                url
            });

            await newItem.save({ session });

            await session.commitTransaction();
            session.endSession();

            return res.status(201).json({ message: "Item berhasil dibuat!", data: newItem });
        } catch (error) {
            console.log(error);
            await session.abortTransaction();
            session.endSession();

            errorLogs(req, res, error.message, "controllers/itemControllers/createItem.js");
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    });
};
