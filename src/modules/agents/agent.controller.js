const agentService = require('./agent.service');

async function signup(req, res, next) {
  try {
    const result = await agentService.signup(req.body, req);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await agentService.login(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function googleAuth(req, res, next) {
  try {
    const result = await agentService.googleAuth(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await agentService.refreshAccessToken(req.body.refreshToken, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    const result = await agentService.logout(refreshToken, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    const result = await agentService.logoutAll(req.agent.id, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await agentService.listSessions(req.agent.id);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

async function revokeSession(req, res, next) {
  try {
    const result = await agentService.revokeSession(req.agent.id, req.params.sessionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const agent = await agentService.getById(req.agent.id);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function publicProfile(req, res, next) {
  try {
    const { slug } = req.params;
    const agent = await agentService.getPublicBySlug(slug);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const agent = await agentService.updateProfile(req.agent.id, req.body);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const result = await agentService.changePassword(req.agent.id, req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Email verification is now a JSON endpoint (6-digit code), not an HTML page.
async function verifyEmailCode(req, res, next) {
  try {
    const result = await agentService.verifyEmailCode(req.agent.id, req.body.code, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resendVerification(req, res, next) {
  try {
    const result = await agentService.resendVerification(req.agent.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function requestEmailChange(req, res, next) {
  try {
    const result = await agentService.requestEmailChange(req.agent.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await agentService.requestPasswordReset(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await agentService.resetPassword(req.body, req);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setAccountStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE, SUSPENDED, or DISABLED' });
    }
    const agent = await agentService.setAccountStatus(req.params.agentId, status, req);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

// All email-adjacent verification now goes through JSON + OTP codes —
// no HTML pages left in this module.
async function confirmEmailChange(req, res, next) {
  try {
    const agent = await agentService.confirmEmailChange(req.agent.id, req.body.code, req);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  googleAuth,
  refresh,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  me,
  publicProfile,
  updateProfile,
  changePassword,
  verifyEmailCode,
  resendVerification,
  requestEmailChange,
  confirmEmailChange,
  forgotPassword,
  resetPassword,
  setAccountStatus,
};
