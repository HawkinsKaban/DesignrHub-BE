const LogModel = require("../../models/logModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getLogById = async (req, res) => {
    try {
        const { id } = req.params;

        const log = await LogModel.findById(id).lean();
        if (!log) {
            return res.status(404).json({ message: "Log not found" });
        }

        return res.status(200).json({ log });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/logControllers/getLogById.js");
        return res.status(500).json({ message: "Internal server error" });
    }
};
