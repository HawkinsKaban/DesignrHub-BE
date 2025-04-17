const express = require('express');
const router = express.Router();

// controllers
const loginAdminController = require('../controllers/authControllers/loginAdmin');
const registerAdminController = require('../controllers/authControllers/registerAdmin');

router.post('/login', loginAdminController.loginAdmin);
// http://localhost:3876/be/api/admin/login

router.post('/register', registerAdminController.registerAdmin);
// http://localhost:3876/be/api/admin/register


module.exports = router;
