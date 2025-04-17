const express = require('express')
const router = express.Router()

//controllers
const createPaymentController = require('../controllers/paymentControllers/createPayment');
const callbackPaymentController = require('../controllers/paymentControllers/callbackPayment');
const getPaymentByIdController = require('../controllers/paymentControllers/getPaymentById');
const getAllPaymentController = require('../controllers/paymentControllers/getAllPayment');
const { protect } = require("../middlewares/authentication")


router.get("/getAll", getAllPaymentController.getAllPayment);
// http://localhost:3876/be/api/payments/getAll

router.get("/get/:id", getPaymentByIdController.getPaymentById);
// http://localhost:3876/be/api/payments/get/:id

router.post("/create", protect, createPaymentController.createUserPayment);
// http://localhost:3876/be/api/payments/create

router.post("/callback", callbackPaymentController.paymentCallBack);
// http://localhost:3876/be/api/payments/callback


module.exports = router
