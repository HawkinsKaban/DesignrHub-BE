const mongoose = require("mongoose");
const CategoryModel = require('../../models/categoryModel');
const { errorLogs } = require('../../utils/errorLogs');

exports.createCategory = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, description, allApps } = req.body;

        if (!name || !description) {
            session.endSession();
            return res.status(400).json({ message: "Nama kategori harus diisi." });
        }

        const existingCategory = await CategoryModel.findOne({ name }).session(session);
        if (existingCategory) {
            session.endSession();
            return res.status(400).json({ message: `Kategori dengan nama ${name} sudah ada.` });
        }

        const newCategory = new CategoryModel({
            name,
            description,
            allApps,
        });

        await newCategory.save({ session });

        await session.commitTransaction();
        res.status(201).json({
            message: "Kategori berhasil dibuat!",
            category: newCategory
        });

    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/categoryControllers/createCategory.js");
        res.status(500).json({ message: "Server error", error: error.message });

    } finally {
        session.endSession();
    }
};
