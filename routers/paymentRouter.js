const express = require('express');
const router = express.Router();

// Import controllers
const createPaymentController = require('../controllers/paymentControllers/createPayment');
const callbackPaymentController = require('../controllers/paymentControllers/callbackPayment');
const getPaymentByIdController = require('../controllers/paymentControllers/getPaymentById');
const getAllPaymentController = require('../controllers/paymentControllers/getAllPayment');
const deletePaymentController = require('../controllers/paymentControllers/deletePayment');
const updatePaymentController = require('../controllers/paymentControllers/updatePayment');
const getPaymentStatsController = require('../controllers/paymentControllers/getPaymentStats');
const polarProductController = require('../controllers/paymentControllers/polarProductController');
const { protect, protectAdmin } = require("../middlewares/authentication");

// Webhook routes - no auth required
router.post("/webhook/polar", callbackPaymentController.polarWebhook);
// http://localhost:3876/be/api/payments/webhook/polar

// Legacy callback (for backward compatibility)
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

// Polar integration routes
router.post("/polar/sync-package/:packageId", protectAdmin, polarProductController.syncPackageWithPolar);
// http://localhost:3876/be/api/payments/polar/sync-package/:packageId

router.post("/polar/sync-all-packages", protectAdmin, polarProductController.syncAllPackagesWithPolar);
// http://localhost:3876/be/api/payments/polar/sync-all-packages

router.get("/polar/product-info/:packageId", protectAdmin, polarProductController.getPolarProductInfo);
// http://localhost:3876/be/api/payments/polar/product-info/:packageId

module.exports = router;

