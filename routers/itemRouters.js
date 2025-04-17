const express = require('express');
const router = express.Router();

// controllers
const createItemController = require('../controllers/itemControllers/createItem');
const getItemController = require('../controllers/itemControllers/getItem');
const updateItemController = require('../controllers/itemControllers/updateItem');
const deleteItemController = require('../controllers/itemControllers/deleteItem');

router.post('/create', createItemController.createItem);
// http://localhost:3876/be/api/item/create

router.get('/find', getItemController.getAllItem);
// http://localhost:3876/be/api/item/find

router.put('/update/:id', updateItemController.updateItem);
// http://localhost:3876/be/api/item/update/:id


router.delete('/delete/:id', deleteItemController.deleteItem);
// http://localhost:3876/be/api/item/delete/:id

module.exports = router;
