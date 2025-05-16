const express = require('express')
const router = express.Router()

const createPackageController = require('../controllers/packageControllers/createPackage')
const getPackageController = require('../controllers/packageControllers/getPackage')
const getActivePackagesController = require('../controllers/packageControllers/getActivePackages');
const updatePackageController = require('../controllers/packageControllers/updatePackage')
const deletePackageController = require('../controllers/packageControllers/deletePackage')

const { protect, protectAdmin } = require("../middlewares/authentication")

router.put("/update/:id", protectAdmin, updatePackageController.updatePackage);
// http://localhost:3876/be/api/package/update/612f3b3b7b3b3b3b3b3b3b3b

router.post("/create", createPackageController.createPackage);
// router.post("/create", protectAdmin, createPackageController.createPackage);
// http://localhost:3876/be/api/package/create

router.get("/list", protect, getPackageController.GetAllPackage);
// http://localhost:3876/be/api/package/list

router.get("/:id", protect, getPackageController.GetPackageById);
// http://localhost:3876/be/api/packages/:id

router.delete("/delete/:id", protectAdmin, deletePackageController.deletePackage);
// http://localhost:3876/be/api/package/delete/612f3b3b7b3b3b3b3b3b3b3b

router.get("/active", protect, getActivePackagesController.getActivePackages);
// http://localhost:3876/be/api/packages/active

module.exports = router