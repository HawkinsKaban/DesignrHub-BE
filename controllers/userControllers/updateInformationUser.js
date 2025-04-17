const UserModel = require("../../models/userModel");
const userMiscModel = require("../../models/userMiscModel");

const { errorLogs } = require("../../utils/errorLogs")

exports.updateInformationUser = async (req, res) => {
    const { username, email, password, role, status, reason, nomor } = req.body;

    try {
        const user = await UserModel.findById(req.params.id);
        if (!user) {
            console.error(`[ERROR] User with ID ${req.params.id} not found`);
            return res.status(404).json({ message: "User not found" });
        }

        if (status && ["inactive", "banned"].includes(status)) {
            user.status = status;
            user.reason = reason || user.reason;
            user.premiumExpiresAt = null;
            user.subscriptionPackage = null;
            user.premiumAccess = false;
            user.isPremium = false;
            user.activePackage = [];

            await user.save();

            const newUserMisc = new userMiscModel({
                userId: user._id,
                note: reason || `User marked as ${status}`,
                type: status,
                isSolved: false,
            });
            await newUserMisc.save();

            return res.json({
                message: `User status updated to ${status}`,
                user,
            });
        }

        user.username = username || user.username;
        user.email = email || user.email;
        if (password) user.password = password;
        if (role) user.role = role;
        if (status) user.status = status;
        if (nomor) user.nomor = nomor;

        await user.save();
        return res.json({
            message: "User basic information updated successfully",
            user,
        });
    } catch (err) {
        errorLogs(req, res, err, "controllers/userControllers/updateInformationUser.js");
        return res.status(500).send("Server Error");
    }
};
