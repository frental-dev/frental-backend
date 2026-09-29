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

// Different path prefix than the rest of this router (agent-properties, not
// properties), so router.use('/properties', requireAuth) above doesn't cover
// it — apply auth explicitly here.
router.get('/agent-properties/search', requireAuth, controller.search);

module.exports = router;
