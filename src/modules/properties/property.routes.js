const express = require('express');
const controller = require('./property.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();
router.use('/properties', requireAuth);

router.post('/properties', controller.create);
router.get('/properties', controller.listMine);
router.get('/properties/:propertyId', controller.getOne);
router.patch('/properties/:propertyId', controller.update);
router.patch('/properties/:propertyId/status', controller.updateStatus);
router.delete('/properties/:propertyId', controller.remove);

module.exports = router;
