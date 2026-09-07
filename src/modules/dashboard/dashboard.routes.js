const express = require('express');
const controller = require('./dashboard.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

router.get('/dashboard', requireAuth, controller.getDashboard);

module.exports = router;
