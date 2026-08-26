const express = require('express');
const controller = require('./client.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

// Client records are private CRM data — always agent-authenticated, never public.
router.use('/clients', requireAuth);

router.post('/clients', controller.create);
router.get('/clients', controller.list);
router.get('/clients/:clientId', controller.getOne);
router.patch('/clients/:clientId', controller.update);
router.delete('/clients/:clientId', controller.remove);

module.exports = router;
