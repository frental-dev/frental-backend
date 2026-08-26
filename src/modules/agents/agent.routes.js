const express = require('express');
const controller = require('./agent.controller');
const requireAuth = require('../../middleware/auth');

const router = express.Router();

// Public routes
router.post('/agents/signup', controller.signup);
router.post('/agents/login', controller.login);
router.get('/agents/public/:slug', controller.publicProfile); // powers the "send them your page" flow

// Authenticated routes
router.get('/agents/me', requireAuth, controller.me);
router.patch('/agents/me', requireAuth, controller.updateProfile);
router.post('/agents/me/change-password', requireAuth, controller.changePassword);

module.exports = router;
