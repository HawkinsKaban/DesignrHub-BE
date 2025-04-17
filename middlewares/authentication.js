const jwt = require("jsonwebtoken");

const UserModel = require("../models/userModel")
const AdminModel = require("../models/adminModel")

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies) {
        token = req.cookies.token;
    }
    if (!token) {
        return res.status(401).json({ message: "No token, authorization denied 1" });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        let user;
        user = await UserModel.findById(req.userId);
        if (!user) {
            user = await AdminModel.findById(req.userId);
        } else {
            if (token != user.currentSessionToken) {
                return res.status(401).json({ message: "No token, authorization denied 2" });
            };
        }
        const admin = await AdminModel.findById(req.userId);
        let isAuth = false

        if (user || user?.currentSessionToken == token) {
            isAuth = true
        }

        if (admin || admin?.currentSessionToken == token) {
            isAuth = true
        }
        if (!isAuth) {
            return res.status(401).json({ message: "Token is not valid" });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error("Error in protect middleware:", err);
        res.status(401).json({ message: "Token is not valid" });
    }
};


const protectAdmin = async (req, res, next) => {
    let token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.adminToken) {
        token = req.cookies.adminToken;
    }
    // console.log(token);
    if (!token) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.adminId = decoded.id;

        const admin = await AdminModel.findById(req.adminId);
        if (!admin) {
            return res.status(401).json({ message: "Token is not valid" });
        }
        req.admin = admin;
        next();
    } catch (err) {
        console.error("Error in protectAdmin middleware:", err);
        res.status(401).json({ message: "Token is not valid" });
    }
};


module.exports = {
    protect,
    protectAdmin
}
