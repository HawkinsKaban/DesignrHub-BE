const LogModel = require("../../models/logModel");
const { errorLogs } = require("../../utils/errorLogs");

const createLogAction = async (userId, action, ip, device) => {
    try {
        const newLog = await new LogModel({
            userId: userId,
            action: action,
            ip: ip,
            device: device,
        }).save();
        await createLogListPerThreeDays(newLog);
    } catch (err) {
        console.error(`Error creating log: ${err.message}`);
    }
};

exports.createLogListPerThreeDays = async (log) => {
    try {

        if (!log || !log.user) {
            console.error("❌ Error: Log atau user dalam log tidak valid!");
            return;
        }

        const endDate = new Date();

        const user = await UserModel.findById(log.user);
        if (!user) {
            console.error("❌ User not found");
            return;
        }

        const LogUser = await LogList.findOne({ userId: log.user }).sort({ createdAt: -1 });

        if (LogUser) {
            const startDate = new Date(LogUser.startDate);

            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 3) {

                const newLogList = new LogList({
                    startDate: endDate,
                    endDate: endDate,
                    userId: user._id,
                    userName: user.username,
                    Logs: [log._id]
                });

                await newLogList.save();
            } else {
                LogUser.endDate = endDate;
                LogUser.Logs.push(log._id);

                await LogUser.save();
            }
        } else {
            const newLogList = new LogList({
                startDate: endDate,
                endDate: endDate,
                userId: user._id,
                userName: user.username,
                Logs: [log._id]
            });
            try {
                await newLogList.save();
            } catch (saveError) {
                helper.errorLogs(saveError.message);
            }
        }
    } catch (error) {
        console.error("❌ Error creating log list:", error.message);
        errorLogs(error.message);
    }
};

module.exports = { createLogAction };
