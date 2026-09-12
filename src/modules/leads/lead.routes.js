const express = require('express');
const controller = require('./lead.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

router.post('/leads/public', controller.createPublic);
router.use('/leads', requireAuth);

router.post('/leads', controller.createManual);
router.get('/leads', controller.list);
router.get('/leads/:leadId', controller.getOne);
router.patch('/leads/:leadId', controller.update);
router.post('/leads/:leadId/convert', controller.convert);
router.delete('/leads/:leadId', controller.remove);

module.exports = router;
