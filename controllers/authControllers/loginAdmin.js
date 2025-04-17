const mongoose = require("mongoose");
const AdminModel = require("../../models/adminModel")
const bcrypt = require("bcryptjs");
const { generateToken } = require("../../utils/generateToken");
const { errorLogs } = require("../../utils/errorLogs");

exports.loginAdmin = async (req, res) => {
    const { email, password } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const admin = await AdminModel.findOne({ email }).session(session);
        if (!admin) {
            session.endSession();
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            session.endSession();
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = generateToken(admin._id);

        const cookieOptions = {
            httpOnly: true,
            maxAge: 2 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
        };
        admin.currentSessionToken = token;


        await admin.save();
        await session.commitTransaction();

        res.cookie("adminToken", token, cookieOptions);
        return res.json({
            _id: admin._id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            token: token,
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error, "controllers/authControllers/loginAdmin.js");
        return res.status(500).json({ message: "Internal server error" });
    } finally {
        session.endSession();
    }
};
