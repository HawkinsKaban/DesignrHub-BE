const express = require('express')
const router = express.Router()

const createCategoryController = require('../controllers/categoryControllers/createCategory')
const updateCategoryController = require('../controllers/categoryControllers/updateCategory')
const deleteCategoryController = require('../controllers/categoryControllers/deleteCategory')
const getAllCategoryController = require('../controllers/categoryControllers/getAllCategory')

const { protect, protectAdmin } = require("../middlewares/authentication")

router.get("/getAll", getAllCategoryController.getAllCategory);
// http://localhost:3876/be/api/category/getAll

router.post("/create", createCategoryController.createCategory);
// http://localhost:3876/be/api/category/create

// router.put("/update/:id", protectAdmin, updateCategoryController.updateCategory);
router.put("/update/:id", updateCategoryController.updateCategory);
// http://localhost:3876/be/api/category/update/:id

// router.delete("/delete/:id", protectAdmin, deleteCategoryController.deleteCategory);
router.delete("/delete/:id", deleteCategoryController.deleteCategory);
// http://localhost:3876/be/api/category/delete/:id




module.exports = router
