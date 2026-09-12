// const rateLimit = require("express-rate-limit");

// const jsonRateLimitHandler = (req, res) => {
//   res
//     .status(429)
//     .json({ error: "Too many requests — please try again later." });
// };

// const signupLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   limit: 10,
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: jsonRateLimitHandler,
// });

// const loginLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   limit: 5,
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: jsonRateLimitHandler,
// });

// const passwordResetLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   limit: 5,
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: jsonRateLimitHandler,
// });

// const resendVerificationLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   limit: 3,
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => req.agent?.id || req.ip,
//   handler: jsonRateLimitHandler,
// });

// const verifyCodeLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   limit: 10,
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => req.agent?.id || req.ip,
//   handler: jsonRateLimitHandler,
// });

// module.exports = {
//   signupLimiter,
//   loginLimiter,
//   passwordResetLimiter,
//   resendVerificationLimiter,
//   verifyCodeLimiter,
// };

const rateLimit = require("express-rate-limit");

const jsonRateLimitHandler = (req, res) => {
  res.status(429).json({
    error: "Too many requests — please try again later.",
  });
};

const isTest = process.env.AUTH_TEST_MODE === "true";

const limits = {
  signup: isTest ? 100 : 10,
  login: isTest ? 100 : 5,
  passwordReset: isTest ? 100 : 5,
  resendVerification: isTest ? 100 : 3,
  verifyCode: isTest ? 100 : 10,
};

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: limits.signup,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: limits.login,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: limits.passwordReset,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: limits.resendVerification,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.agent?.id || req.ip,
  handler: jsonRateLimitHandler,
});

const verifyCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: limits.verifyCode,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.agent?.id || req.ip,
  handler: jsonRateLimitHandler,
});

module.exports = {
  signupLimiter,
  loginLimiter,
  passwordResetLimiter,
  resendVerificationLimiter,
  verifyCodeLimiter,
};
