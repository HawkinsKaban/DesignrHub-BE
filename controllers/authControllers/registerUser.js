const mongoose = require("mongoose");
const UserModel = require("../../models/userModel");

const { generateVerifEmail } = require("../../utils/bodyEmail");
const { sendEmail } = require("../../utils/sendEmail");
const { errorLogs } = require("../../utils/errorLogs")
const { generateToken } = require("../../utils/generateToken");



exports.registerUser = async (req, res) => {
    const { username, email, password, nomor, language } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let user = await UserModel.findOne(
            { $or: [{ username }, { email }, { nomor }] },
            null,
            { session }
        );

        if (user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: language === "id"
                    ? "Username, Email, atau Nomor WhatsApp sudah digunakan"
                    : "Username, Email, or Phone number already exists"
            });
        }

        user = new UserModel({ username, email, password, nomor });
        const createdUser = await user.save({ session });

        const token = generateToken(createdUser._id);
        const verificationUrl = `${process.env.BE_URL}be/api/auth/verify/${token}`;
        const emailHtml = generateVerifEmail(verificationUrl);

        await sendEmail(
            createdUser.email,
            "Verifikasi Email dari Premium Portal",
            "Terima kasih telah mendaftar di Premium Portal! Untuk melanjutkan, silakan verifikasi email Anda dengan mengklik tautan berikut:",
            emailHtml
        );

        await session.commitTransaction();
        res.status(201).json({
            message: "User registered successfully. Please check your email to verify your account."
        });

    } catch (error) {
        await session.abortTransaction();
        console.log(error);
        errorLogs(req, res, error, "controllers/authControllers/registerUser.js");
        res.status(500).json({ message: "Server error", error: error.message });

    } finally {
        session.endSession();
    }
};
