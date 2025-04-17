const UserModel = require("../../models/userModel");
const { generateToken } = require("../../utils/generateToken");
const { sendEmail } = require("../../utils/sendEmail");
const { errorLogs } = require("../../utils/errorLogs");
const jwt = require("jsonwebtoken");
const { generateEmailIndoTemplate, generateVerifEmail } = require("../../utils/bodyEmail");

exports.requestForgotPassword = async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.body.email });

        if (!user) {
            return res.status(404).json({ message: "Email not found" });
        }
        const tokenResetPassword = generateToken(user._id);

        const resetUrl = `${process.env.FE_URL}update-password/${encodeURIComponent(
            tokenResetPassword
        )}`;

        const emailTemplate = generateEmailIndoTemplate(resetUrl);

        await sendEmail(
            user.email,
            "Reset Password",
            "Please click the button below to reset your password",
            emailTemplate
        );
        res.status(200).json({ message: "Password reset link sent to your email" });
    } catch (error) {
        errorLogs(req, res, error, "controllers/authControllers/forgotPassUser.js ( requestForgotPassword )");
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};


exports.resetPassword = async (req, res) => {
    const { newPassword } = req.body;
    const { token } = req.params;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const id = decoded.id;
        const user = await UserModel.findById(id);

        if (!user) {
            return res.status(400).json({ message: "Invalid token" });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: "Password reset successfully" });
    } catch (error) {
        errorLogs(req, res, error, "controllers/authControllers/forgotPassUser.js ( resetPassword )");
        res.status(400).json({ message: "Invalid or expired token" });
    }
};
