const mongoose = require("mongoose");
const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs");

exports.createUser = async (req, res) => {
    const { username, email, password, nomor, language } = req.body;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

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

        const newUser = new UserModel({
            username,
            email,
            password,
            nomor,
            emailVerified: true,
            premiumAccess: false,
            premiumExpiresAt: null,
            currentSessionToken: null,
            subscriptionPackage: null,  // Gunakan null jika tidak ada paket
            isAfiliator: false,
            afiliatedBy: null,
            codeAfiliator: null,
            expireAfiliator: null,
            status: "active",
        });

        await newUser.save({ session });

        await session.commitTransaction();

        res.status(201).json({
            message: "User created successfully."
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
