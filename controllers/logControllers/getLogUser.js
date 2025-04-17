
const LogModel = require("../../models/logModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.getUserLogs = async (req, res) => {
    try {
        console.log('req.userId:', req.userId);
        const logs = await LogModel.find({ user: req.userId }).sort({ createdAt: -1 });
        if (!logs.length) {
            return res.status(404).json({ message: 'No logs found for this user' });
        }
        res.json(logs);
    } catch (err) {
        errorLogs(req, res, err.message, 'controllers/logControllers/getLogUser.js');
        console.error('Error fetching user logs:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
};
