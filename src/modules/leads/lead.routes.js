const express = require('express');
const controller = require('./lead.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

// Public: a marketplace visitor inquiring about a listing becomes a Lead, no auth required.
router.post('/leads/public', controller.createPublic);

// Everything else is the agent managing their own pipeline.
router.use('/leads', requireAuth);

router.post('/leads', controller.createManual);
router.get('/leads', controller.list); // ?status=&source=
router.get('/leads/:leadId', controller.getOne);
router.patch('/leads/:leadId', controller.update);
router.post('/leads/:leadId/convert', controller.convert); // lead -> Client
router.delete('/leads/:leadId', controller.remove);

module.exports = router;
