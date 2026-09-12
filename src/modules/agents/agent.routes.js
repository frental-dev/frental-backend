const express = require('express');
const controller = require('./agent.controller');
const requireAuth = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const { validateBody } = require('../../middleware/validate');
const {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  changeEmailSchema,
  googleAuthSchema,
  refreshSchema,
  verifyEmailCodeSchema,
  confirmEmailChangeSchema,
} = require('../../validation/agent.schemas');
const {
  signupLimiter,
  loginLimiter,
  passwordResetLimiter,
  resendVerificationLimiter,
  verifyCodeLimiter,
} = require('../../middleware/rateLimit');

const router = express.Router();

// --- Public: signup / login / Google / token refresh ---
router.post('/agents/signup', signupLimiter, validateBody(signupSchema), controller.signup);
router.post('/agents/login', loginLimiter, validateBody(loginSchema), controller.login);
router.post('/agents/google', loginLimiter, validateBody(googleAuthSchema), controller.googleAuth);
router.post('/agents/refresh', validateBody(refreshSchema), controller.refresh);
router.post('/agents/logout', controller.logout);

// --- Public: forgot/reset password (unauthenticated by nature — the agent
// has no session yet, so the code is checked against phone/email + code together) ---
router.post('/agents/forgot-password', passwordResetLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
router.post('/agents/reset-password', passwordResetLimiter, validateBody(resetPasswordSchema), controller.resetPassword);

// --- Public: agent's shareable page ---
router.get('/agents/public/:slug', controller.publicProfile);

// --- Authenticated ---
router.get('/agents/me', requireAuth, controller.me);
router.patch('/agents/me', requireAuth, controller.updateProfile);
router.post('/agents/me/change-password', requireAuth, validateBody(changePasswordSchema), controller.changePassword);
router.post('/agents/me/change-email', requireAuth, validateBody(changeEmailSchema), controller.requestEmailChange);
router.post('/agents/me/confirm-email-change', requireAuth, verifyCodeLimiter, validateBody(confirmEmailChangeSchema), controller.confirmEmailChange);
// Email verification: 6-digit code, checked against the authenticated agent's own account.
router.post('/agents/me/verify-email', requireAuth, verifyCodeLimiter, validateBody(verifyEmailCodeSchema), controller.verifyEmailCode);
router.post('/agents/me/resend-verification', requireAuth, resendVerificationLimiter, controller.resendVerification);
router.post('/agents/logout-all', requireAuth, controller.logoutAll);
router.get('/agents/me/sessions', requireAuth, controller.listSessions);
router.delete('/agents/me/sessions/:sessionId', requireAuth, controller.revokeSession);

// --- Admin only ---
router.patch('/agents/:agentId/status', requireAuth, requireRole('ADMIN'), controller.setAccountStatus);

module.exports = router;
