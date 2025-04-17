const mongoose = require("mongoose");
const LogModel = require("../../models/logModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.deleteAllLogUser = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;

        await LogModel.deleteMany({ userId: id }).session(session);

        await session.commitTransaction();
        res.status(200).json({ message: "All log user deleted!" });

    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/logControllers/deleteLog.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
}

exports.deleteSpecificLog = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;

        await LogModel.findByIdAndDelete(id).session(session);

        await session.commitTransaction();
        res.status(200).json({ message: "Log deleted!" });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error.message, "controllers/logControllers/deleteLog.js");
        res.status(500).json({ message: "Server error", error: error.message });
    } finally {
        session.endSession();
    }
}
