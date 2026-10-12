const express = require('express');
const controller = require('./marketplace.controller');

const router = express.Router();

router.get('/marketplace/properties', controller.search);
router.get('/marketplace/properties/:propertyId', controller.getOne);

module.exports = router;
