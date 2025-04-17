const express = require('express')
const router = express.Router()

const getAllogController = require('../controllers/logControllers/getLog')
const getLogByIdController = require('../controllers/logControllers/getLogById')
const getUserLogsController = require('../controllers/logControllers/getLogUser')
const { protect, protectAdmin } = require("../middlewares/authentication")

// admin
router.get("/getAll", getAllogController.getAllog);
// http://localhost:3876/be/api/log/list

router.get("/get/:id", getLogByIdController.getLogById);
// http://localhost:3876/be/api/log/get/:id


// user
router.get("/user", protect, getUserLogsController.getUserLogs);
// http://localhost:3876/be/api/log/user




module.exports = router
