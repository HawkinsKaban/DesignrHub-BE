const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const TypeModel = require("../../models/typeModel");
const ItemModel = require("../../models/itemModel");
const { errorLogs } = require("../../utils/errorLogs");
const { upload } = require("../../middlewares/upload");

exports.deleteType = async (req, res) => {
    try {
        const id = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid ID format" });
        }

        const type = await TypeModel.findById(id);
        const itemHasRef = await ItemModel.findOne({ typeId: id });

        if (itemHasRef) {
            console.log("Type sedang digunakan di salah satu item");
            return res
                .status(400)
                .json({ message: "Type sedang digunakan di salah satu item" });
        }

        if (!type) {
            return res.status(404).json({ message: "Type not found" });
        }

        await type.deleteOne();
        console.log("Type berhasil dihapus");
        res.json({ message: "Type deleted successfully" });
    } catch (error) {
        errorLogs(req, res, error, "controllers/typeControllers/deleteType.js");
        res.status(500).json({ message: "Server error" });
    }
};
