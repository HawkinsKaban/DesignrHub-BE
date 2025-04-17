const UserModel = require("../../models/userModel");
const { errorLogs } = require("../../utils/errorLogs")

exports.deleteUser = async (req, res) => {
    try {
        const user = await UserModel.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User deleted successfully" });
    } catch (err) {
        errorLogs(req, res, err, "controllers/userControllers/deleteUser.js");
        res.status(500).send("Server Error");
    }
};
