const LogModel = require("../../models/logModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getAllog = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const logs = await LogModel.find()
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({ logs });

    } catch (error) {
        errorLogs(req, res, error.message, "controllers/logControllers/getLog.js");
        return res.status(500).json({ message: "Internal server error" });
    }
};
