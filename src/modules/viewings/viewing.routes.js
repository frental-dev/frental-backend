const express = require('express');
const controller = require('./viewing.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();
router.use('/viewings', requireAuth);

router.post('/viewings', controller.create);
router.get('/viewings', controller.list);
router.get('/viewings/:viewingId', controller.getOne);
router.patch('/viewings/:viewingId', controller.update);
router.patch('/viewings/:viewingId/status', controller.updateStatus);
router.delete('/viewings/:viewingId', controller.remove);

module.exports = router;
