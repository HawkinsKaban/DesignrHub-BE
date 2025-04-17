const UserModel = require("../../models/userModel");
const Session = require("../../models/sesionModel");
const jwt = require("jsonwebtoken");
const useragent = require("useragent");
const { getPublicIp } = require("../../utils/getIp");
const { createLogAction } = require("../logControllers/createLog");


exports.logout = async (req, res) => {
    try {
        let token;
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies) {
            token = req.cookies.token;
        }

        if (!token) return res.status(400).json({ message: "No token found" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await UserModel.findById(decoded.id);

        if (user) {
            await Session.findOneAndDelete({ user: user._id });
            user.currentSessionToken = null;
            await user.save();

            const publicIp = (await getPublicIp(req)) || "0.0.0.0";

            const agent = useragent.parse(req.headers["user-agent"]);
            const device = `${agent.toAgent()} on ${agent.os} (${agent.device.family || "Unknown Device"
                })`;

            await createLogAction(user._id, "logout", publicIp, device);
        }

        res.clearCookie("token");
        res.json({ message: "Logged out successfully" });
    } catch (err) {
        errorLogs(req, res, err.message, "controllers/authControllers/logoutUser.js");
        res.status(500).json({ message: "Server error" });
    }
};
