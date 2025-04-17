const express = require('express');
const router = express.Router();
// controllers
const loginUserController = require('../controllers/authControllers/loginUser');
const registerUserController = require('../controllers/authControllers/registerUser');
const verifyUserController = require('../controllers/authControllers/verifyEmail');
const forgotePassUserController = require('../controllers/authControllers/forgotePassUser');
const logoutUserController = require('../controllers/authControllers/logoutUser');

const { protect, protectAdmin } = require("../middlewares/authentication")

router.post('/login', loginUserController.login);
// http://localhost:3876/be/api/auth/login

router.post('/register', registerUserController.registerUser);
// http://localhost:3876/be/api/auth/register

router.get('/verify/:token', verifyUserController.verifyEmail);
// http://localhost:3876/be/api/auth/verify/:token

router.post('/request-forgot-password', forgotePassUserController.requestForgotPassword);
// http://localhost:3876/be/api/auth/request-forgot-password

router.post('/logout', protect, logoutUserController.logout);
// http://localhost:3876/be/api/auth/logout

module.exports = router;
