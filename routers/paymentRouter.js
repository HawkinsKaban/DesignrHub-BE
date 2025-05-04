const express = require('express');
const router = express.Router();

// Controllers
const createPaymentController = require('../controllers/paymentControllers/createPayment');
const callbackPaymentController = require('../controllers/paymentControllers/callbackPayment');
const getPaymentByIdController = require('../controllers/paymentControllers/getPaymentById');
const getAllPaymentController = require('../controllers/paymentControllers/getAllPayment');
const deletePaymentController = require('../controllers/paymentControllers/deletePayment');
const updatePaymentController = require('../controllers/paymentControllers/updatePayment');
const getPaymentStatsController = require('../controllers/paymentControllers/getPaymentStats');
const { protect, protectAdmin } = require("../middlewares/authentication");

// Public routes
router.post("/callback", callbackPaymentController.paymentCallBack);
// http://localhost:3876/be/api/payments/callback

// User routes
router.post("/create", protect, createPaymentController.createUserPayment);
// http://localhost:3876/be/api/payments/create

// Admin routes 
router.get("/getAll", protectAdmin, getAllPaymentController.getAllPayment);
// http://localhost:3876/be/api/payments/getAll

router.get("/get/:id", protectAdmin, getPaymentByIdController.getPaymentById);
// http://localhost:3876/be/api/payments/get/:id

router.delete("/delete/:id", protectAdmin, deletePaymentController.deletePayment);
// http://localhost:3876/be/api/payments/delete/:id

router.put("/update/:id", protectAdmin, updatePaymentController.updateUserPayment);
// http://localhost:3876/be/api/payments/update/:id

router.get("/stats", protectAdmin, getPaymentStatsController.getPaymentStats);
// http://localhost:3876/be/api/payments/stats

module.exports = router;