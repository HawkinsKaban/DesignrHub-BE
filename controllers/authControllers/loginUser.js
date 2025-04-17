const UserModel = require("../../models/userModel");
const AdminModel = require("../../models/adminModel");
const SessionModel = require("../../models/sesionModel");


const { generateToken } = require("../../utils/generateToken");
const { getPublicIp } = require("../../utils/getIp");
const { errorLogs } = require("../../utils/errorLogs");
const { createLogAction } = require("../logControllers/createLog");
const UAParser = require("ua-parser-js");


exports.login = async (req, res) => {
    const { email, password, language } = req.body;
    try {
        const admin = await AdminModel.findOne({ email });

        if (admin) {
            return res.status(400).json({
                message: "Email Tidak Ditemukan"
            });
        }

        const user = await UserModel.findOne({ email });

        if (!user) {
            return res.status(400).json({
                message: language === "id" ? "Email Tidak Ditemukan" : "Email Not Found"
            });
        }
        if (!password) {
            return res.status(400).json({
                message:
                    language === "id" ? "Password Tidak Sesuai" : "Password Didn't Match"
            });
        }
        const isPasswordMatch = await user.matchPassword(password);

        if (!isPasswordMatch) {
            return res.status(400).json({
                message:
                    language === "id" ? "Password Tidak Sesuai" : "Password Didn't Match"
            });
        }

        await SessionModel.findOneAndDelete({ user: user._id });

        const token = generateToken(user._id);
        const session = new SessionModel({
            user: user._id,
            token,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
        });
        await session.save();

        const publicIp = (await getPublicIp(req)) || "0.0.0.0";

        const parser = new UAParser();
        const agent = parser.setUA(req.headers["user-agent"]).getResult();
        const device = `${agent.browser.name} on ${agent.os.name} (${agent.device.model || "Unknown Device"})`;

        const resetUrl = `${process.env.FE_URL}update-password/${token}`;

        await createLogAction(user._id, "login", publicIp, device);

        user.currentSessionToken = token;
        await user.save();

        const cookieOptions = {
            httpOnly: true,
            maxAge: 12 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict"
        };

        res.cookie("token", token, cookieOptions);
        res.json({ message: "Login successful", token });
    } catch (err) {
        errorLogs(req, res, err.message, "controllers/authControllers/loginUser.js");
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
};
