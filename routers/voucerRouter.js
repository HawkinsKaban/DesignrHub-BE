const express = require('express')
const router = express.Router()

const createVoucherController = require('../controllers/voucerControllers/createVoucer');
const getVoucherController = require('../controllers/voucerControllers/getVoucer');
const deleteVoucherController = require('../controllers/voucerControllers/deleteVoucher');
const updateVoucherController = require('../controllers/voucerControllers/updateVoucher');

const { protect, protectAdmin } = require("../middlewares/authentication")

// router.post("/create", protectAdmin, createVoucherController.createVoucher);
router.post("/create", createVoucherController.createVoucher);
// http://localhost:3876/be/api/voucher/create

router.get("/list", protect, getVoucherController.getAllVoucer);
// http://localhost:3876/be/api/voucher/list

router.put("/:id", protectAdmin, updateVoucherController.updateVoucher);
// http://localhost:3876/be/api/voucher/:id

router.delete("/:id", protectAdmin, deleteVoucherController.deleteVoucher);
// http://localhost:3876/be/api/voucher/:id



module.exports = router
