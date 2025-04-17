const express = require("express");
const router = express.Router();

// controllers
const createUserController = require("../controllers/userControllers/createUser");
const deleteUserController = require("../controllers/userControllers/deleteUser");
const updateInformationUserController = require("../controllers/userControllers/updateInformationUser");
const updateSubscriptionUserController = require("../controllers/userControllers/updateSubsCriptionUser");
const getUserController = require("../controllers/userControllers/getUsers");
const getProfileUser = require("../controllers/userControllers/profileUser");
const { protect, protectAdmin } = require("../middlewares/authentication");

// admin
router.get("/", protectAdmin, getUserController.getAllUsers);
// http://localhost:3876/be/api/user

router.get("/:id", protectAdmin, getUserController.getUserById);
// http://localhost:3876/be/api/user/:id

router.post("/create", protectAdmin, createUserController.createUser);
// http://localhost:3876/be/api/user/create

router.delete("/:id", protectAdmin, deleteUserController.deleteUser);
// http://localhost:3876/be/api/user/:id

router.patch("/:id", protectAdmin, updateInformationUserController.updateInformationUser);
// http://localhost:3876/be/api/user/:id

router.patch("/subscription/:id", protectAdmin, updateSubscriptionUserController.updateSubscriptionUser);
// http://localhost:3876/be/api/user/subscription/:id

// user
router.get("/profile/dashboard", protect, getProfileUser.getProfileDashboard);
// http://localhost:3876/be/api/user/profile/dashboard




module.exports = router;
