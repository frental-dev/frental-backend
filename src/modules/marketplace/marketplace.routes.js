const express = require('express');
const controller = require('./marketplace.controller');

const router = express.Router();

// Fully public — this is the highest-traffic surface in the app.
// No requireAuth here; cache aggressively at this layer once traffic grows.
router.get('/marketplace/properties', controller.search);
router.get('/marketplace/properties/:propertyId', controller.getOne);

module.exports = router;
