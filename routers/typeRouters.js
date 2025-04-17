const express = require('express');
const router = express.Router();

// controllers
const createTypeController = require('../controllers/typeControllers/createType');
const getTypeController = require('../controllers/typeControllers/getType');
const deleteTypeController = require('../controllers/typeControllers/deleteType');
const updateTypeController = require('../controllers/typeControllers/updateType');

router.post('/create', createTypeController.createType);
// http://localhost:3876/be/api/type/create

router.get('/', getTypeController.getAllTypes);
// http://localhost:3876/be/api/type/

router.put('/:id', updateTypeController.updateType);
// http://localhost:3876/be/api/type/:id

router.delete('/:id', deleteTypeController.deleteType);
// http://localhost:3876/be/api/type/:id



module.exports = router;










// pppppp
