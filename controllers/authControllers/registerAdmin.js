const mongoose = require("mongoose");
const AdminModel = require("../../models/adminModel")
const { generateToken } = require("../../utils/generateToken");
const { errorLogs } = require("../../utils/errorLogs");

exports.registerAdmin = async (req, res) => {
    const { username, email, password } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const adminExists = await AdminModel.findOne({ email });
        console.log("adminExists", adminExists);

        if (adminExists) {
            session.endSession();
            return res.status(400).json({ message: "Admin already exists" });
        }

        const admin = new AdminModel({
            username,
            email,
            password,
        });

        await admin.save();

        const token = generateToken(admin._id);

        const cookieOptions = {
            httpOnly: true,
            maxAge: 60 * 60 * 1000,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Strict",
        };

        admin.currentSessionToken = token;
        await admin.save();
        await session.commitTransaction();

        res.cookie("adminToken", token, cookieOptions);
        return res.status(201).json({
            _id: admin._id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
        });
    } catch (error) {
        await session.abortTransaction();
        errorLogs(req, res, error, "controllers/authControllers/registerAdmin.js");
        return res.status(500).json({ message: "Internal server error" });
    } finally {
        session.endSession();
    }
};
