const rateLimit = require('express-rate-limit');

// In-memory store — correct for a single Render instance. If this ever runs
// as multiple instances/dynos, each instance tracks its own counts
// independently, meaning the effective limit is (limit × instance count).
// Fix at that point with a shared store (e.g. rate-limit-redis against the
// same Redis instance already used for BullMQ) — not needed at current scale.

const jsonRateLimitHandler = (req, res) => {
  res.status(429).json({ error: 'Too many requests — please try again later.' });
};

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

// Keyed by agent id (authenticated route), not IP — one agent shouldn't be
// able to spam their own inbox via multiple IPs, and this shouldn't
// penalize other agents sharing an office/IP.
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.agent?.id || req.ip,
  handler: jsonRateLimitHandler,
});

module.exports = { signupLimiter, loginLimiter, passwordResetLimiter, resendVerificationLimiter };
