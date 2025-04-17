const ItemModel = require("../../models/itemModel");
const { errorLogs } = require("../../utils/errorLogs");


exports.deleteItem = async (req, res) => {
    try {
        const item = await ItemModel.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }
        res.json({ message: "Item deleted successfully" });
    } catch (error) {
        errorLogs(req, res, error, "controllers/itemControllers/deleteItem.js");
        res.status(500).json({ message: "Server error" });
    }
};
