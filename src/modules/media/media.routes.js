const express = require('express');
const controller = require('./media.controller');
const { upload, enforcePerTypeLimits } = require('../../middleware/upload');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

router.post('/properties/:propertyId/media', requireAuth, upload.array('files', 10), enforcePerTypeLimits, controller.upload);
router.get('/properties/:propertyId/media', requireAuth, controller.list);
router.delete('/media/:mediaId', requireAuth, controller.remove);

module.exports = router;
