const UserModel = require("../../models/userModel");
const mongoose = require("mongoose");

const jwt = require("jsonwebtoken");
const { errorLogs } = require("../../utils/errorLogs");
require("dotenv").config();


exports.verifyEmail = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(decoded.id);

        const user = await UserModel.findOne({ _id: decoded.id }).session(session);

        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Invalid token or user not found" });
        }

        if (user.emailVerified) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Email already verified" });
        }


        user.emailVerified = true;
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.redirect(`${process.env.FE_URL}login`);
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        errorLogs(req, res, err.message, "controllers/authControllers/verifyEmail.js");
        res.status(400).json({ message: "Invalid or expired token" });
    }
};
