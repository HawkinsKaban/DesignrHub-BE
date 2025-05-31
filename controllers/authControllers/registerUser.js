// controllers/authControllers/registerUser.js
const mongoose = require("mongoose");
const UserModel = require("../../models/userModel");

const { generateVerifEmail } = require("../../utils/bodyEmail");
const { sendEmail } = require("../../utils/sendEmail");
const { errorLogs } = require("../../utils/errorLogs")
const { generateToken } = require("../../utils/generateToken");
const polarService = require("../../services/polarService");

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
        console.log(`[RegisterUserCtrl] User ${createdUser.email} saved to DB (ID: ${createdUser._id}) temporarily.`);

        // Create customer in Polar
        try {
            const polarCustomer = await polarService.createOrUpdateCustomer({
                _id: createdUser._id, // Ini akan jadi external_id di Polar
                email: createdUser.email,
                username: createdUser.username,
                nomor: createdUser.nomor,
                createdAt: createdUser.createdAt // Kirim tanggal pembuatan jika berguna untuk metadata Polar
            });
            
            createdUser.polarCustomerId = polarCustomer.id; // Simpan ID Customer Polar
            await createdUser.save({ session }); // Simpan lagi dengan polarCustomerId
            
            console.log(`[RegisterUserCtrl] ✅ User ${createdUser.email} registered with Polar customer ID: ${polarCustomer.id}`);
        } catch (polarError) {
            console.error(`[RegisterUserCtrl] ⚠️ Error creating/updating Polar customer for ${createdUser.email}: ${polarError.message}. Aborting transaction.`);
            errorLogs(req, null, `Polar customer sync failed for new user ${createdUser.email}: ${polarError.message}`, "controllers/authControllers/registerUser.js (Polar Sync)");
            
            await session.abortTransaction(); // BATALKAN TRANSAKSI LOKAL
            session.endSession();
            
            return res.status(500).json({ 
                message: language === "id" ? "Registrasi pengguna gagal karena masalah sinkronisasi dengan sistem pembayaran. Silakan coba lagi nanti." : "User registration failed due to payment system synchronization issue. Please try again later.",
                error: `Polar service: ${polarError.message}`
            });
        }

        const token = generateToken(createdUser._id);
        const verificationUrl = `${process.env.BE_URL}be/api/auth/verify/${token}`;
        const emailHtml = generateVerifEmail(verificationUrl);

        await sendEmail(
            createdUser.email,
            "Verifikasi Email dari Premium Portal", // Sesuaikan subjek jika perlu
            "Terima kasih telah mendaftar di Premium Portal! Untuk melanjutkan, silakan verifikasi email Anda dengan mengklik tautan berikut:",
            emailHtml
        );

        await session.commitTransaction();
        console.log(`[RegisterUserCtrl] Transaction committed for user ${createdUser.email}.`);
        res.status(201).json({
            message: "User registered successfully. Please check your email to verify your account."
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('[RegisterUserCtrl] ❌ Server error during user registration:', error);
        errorLogs(req, res, error.message, "controllers/authControllers/registerUser.js");
        res.status(500).json({ message: "Server error", error: error.message });

    } finally {
        if (session.inTransaction()) { // Pastikan session selalu diakhiri
            await session.abortTransaction();
        }
        session.endSession();
        console.log("[RegisterUserCtrl] User registration process finished.");
    }
};