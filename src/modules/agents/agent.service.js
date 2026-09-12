const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateRawToken, hashToken, generateOtpCode } = require('../../utils/tokens');
const { logAuthEvent } = require('../../services/authEvents');
const { verifyGoogleIdToken } = require('../../config/google');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendChangeEmailConfirmation,
} = require('../../services/email');

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function generateUniqueSlug(name) {
  const base = slugify(name) || 'agent';
  let slug = base;
  let suffix = 1;
  while (await prisma.agent.findUnique({ where: { publicSlug: slug } })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

function toPublicAgent(agent) {
  const {
    passwordHash,
    emailVerificationToken,
    emailVerificationExpires,
    emailVerificationAttempts,
    passwordResetToken,
    passwordResetExpires,
    passwordResetAttempts,
    pendingEmailToken,
    pendingEmailExpires,
    pendingEmailAttempts,
    failedLoginAttempts,
    lockedUntil,
    googleId,
    ...safe
  } = agent;
  return safe;
}

function issueAccessToken(agent) {
  return jwt.sign({ sub: agent.id, role: agent.role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

async function issueRefreshToken(agentId, req) {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      agentId,
      tokenHash: hashToken(raw),
      userAgent: req?.headers['user-agent'] || null,
      ipAddress: req?.ip || null,
      expiresAt,
    },
  });

  return raw;
}

async function issueTokenPair(agent, req) {
  return {
    accessToken: issueAccessToken(agent),
    refreshToken: await issueRefreshToken(agent.id, req),
  };
}

/**
 * Generates a fresh 6-digit OTP, stores its hash, resets the attempt
 * counter, and emails it. Used for both initial signup verification and
 * "resend code".
 */
async function createAndSendVerification(agent) {
  const code = generateOtpCode();
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      emailVerificationToken: hashToken(code),
      emailVerificationExpires: expires,
      emailVerificationAttempts: 0,
    },
  });

  await sendVerificationEmail(updated, code).catch((err) =>
    console.error(`[agents] failed to send verification code to ${updated.email}:`, err.message)
  );

  return updated;
}

// ---------------------------------------------------------------------
// Signup / Login
// ---------------------------------------------------------------------

async function signup({ name, phone, whatsapp, email, password }, req) {
  const existingEmail = await prisma.agent.findUnique({ where: { email } });
  if (existingEmail) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 409;
    throw err;
  }
  if (phone) {
    const existingPhone = await prisma.agent.findUnique({ where: { phone } });
    if (existingPhone) {
      const err = new Error('An account with this phone number already exists');
      err.statusCode = 409;
      throw err;
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const publicSlug = await generateUniqueSlug(name);

  let agent = await prisma.agent.create({
    data: { name, phone, whatsapp, email, passwordHash, publicSlug },
  });

  agent = await createAndSendVerification(agent);
  await logAuthEvent({ agentId: agent.id, type: 'SIGNUP', req });

  const tokens = await issueTokenPair(agent, req);
  return { agent: toPublicAgent(agent), ...tokens };
}

async function login({ phone, email, password }, req) {
  const agent = phone
    ? await prisma.agent.findUnique({ where: { phone } })
    : await prisma.agent.findUnique({ where: { email } });

  const genericError = () => {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    return err;
  };

  if (!agent) {
    await logAuthEvent({ type: 'LOGIN_FAILED', req, metadata: { reason: 'not_found' } });
    throw genericError();
  }

  if (agent.status !== 'ACTIVE') {
    await logAuthEvent({ agentId: agent.id, type: 'LOGIN_FAILED', req, metadata: { reason: 'account_' + agent.status.toLowerCase() } });
    const err = new Error(`Account is ${agent.status.toLowerCase()}`);
    err.statusCode = 403;
    throw err;
  }

  if (agent.lockedUntil && agent.lockedUntil > new Date()) {
    await logAuthEvent({ agentId: agent.id, type: 'LOGIN_FAILED', req, metadata: { reason: 'locked' } });
    const err = new Error(`Too many failed attempts — try again after ${agent.lockedUntil.toISOString()}`);
    err.statusCode = 423;
    throw err;
  }

  if (!agent.passwordHash) {
    await logAuthEvent({ agentId: agent.id, type: 'LOGIN_FAILED', req, metadata: { reason: 'no_password_google_account' } });
    const err = new Error('This account signed up with Google — use "Sign in with Google" instead');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, agent.passwordHash);
  if (!valid) {
    const attempts = agent.failedLoginAttempts + 1;
    const data = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      data.failedLoginAttempts = 0;
    }
    await prisma.agent.update({ where: { id: agent.id }, data });
    await logAuthEvent({ agentId: agent.id, type: 'LOGIN_FAILED', req, metadata: { reason: 'bad_password', attempts } });
    throw genericError();
  }

  if (agent.failedLoginAttempts > 0 || agent.lockedUntil) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  await logAuthEvent({ agentId: agent.id, type: 'LOGIN_SUCCESS', req });
  const tokens = await issueTokenPair(agent, req);
  return { agent: toPublicAgent(agent), ...tokens };
}

// ---------------------------------------------------------------------
// Google Sign-In
// ---------------------------------------------------------------------

async function googleAuth({ idToken }, req) {
  let payload;
  try {
    payload = await verifyGoogleIdToken(idToken);
  } catch {
    const err = new Error('Invalid Google token');
    err.statusCode = 401;
    throw err;
  }

  const { sub: googleId, email, name, email_verified: googleEmailVerified } = payload;

  let agent = await prisma.agent.findUnique({ where: { googleId } });

  if (!agent) {
    const existingByEmail = email ? await prisma.agent.findUnique({ where: { email } }) : null;

    if (existingByEmail) {
      agent = await prisma.agent.update({
        where: { id: existingByEmail.id },
        data: {
          googleId,
          emailVerified: existingByEmail.emailVerified || Boolean(googleEmailVerified),
        },
      });
    } else {
      const publicSlug = await generateUniqueSlug(name || email || 'agent');
      agent = await prisma.agent.create({
        data: {
          name: name || 'Frental Agent',
          email,
          googleId,
          emailVerified: Boolean(googleEmailVerified),
          publicSlug,
        },
      });
    }
  }

  if (agent.status !== 'ACTIVE') {
    const err = new Error(`Account is ${agent.status.toLowerCase()}`);
    err.statusCode = 403;
    throw err;
  }

  await logAuthEvent({ agentId: agent.id, type: 'GOOGLE_SIGNIN', req });
  const tokens = await issueTokenPair(agent, req);
  return { agent: toPublicAgent(agent), ...tokens };
}

// ---------------------------------------------------------------------
// Token refresh / logout / sessions
// ---------------------------------------------------------------------

async function refreshAccessToken(rawRefreshToken, req) {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { agent: true } });

  const invalid = () => {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    return err;
  };

  if (!stored || stored.revokedAt) throw invalid();
  if (stored.expiresAt < new Date()) throw invalid();
  if (stored.agent.status !== 'ACTIVE') throw invalid();

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });

  await logAuthEvent({ agentId: stored.agentId, type: 'TOKEN_REFRESHED', req });

  return issueTokenPair(stored.agent, req);
}

async function logout(rawRefreshToken, req) {
  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (stored && !stored.revokedAt) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    await logAuthEvent({ agentId: stored.agentId, type: 'LOGOUT', req });
  }
  return { success: true };
}

async function logoutAll(agentId, req) {
  await prisma.refreshToken.updateMany({
    where: { agentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAuthEvent({ agentId, type: 'LOGOUT_ALL', req });
  return { success: true };
}

async function listSessions(agentId) {
  return prisma.refreshToken.findMany({
    where: { agentId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
}

async function revokeSession(agentId, sessionId) {
  const session = await prisma.refreshToken.findFirst({ where: { id: sessionId, agentId } });
  if (!session) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  return { success: true };
}

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------

async function getById(agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  return toPublicAgent(agent);
}

async function getPublicBySlug(publicSlug) {
  const agent = await prisma.agent.findUnique({
    where: { publicSlug },
    include: {
      properties: {
        where: { status: 'AVAILABLE' },
        include: { media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  return toPublicAgent(agent);
}

async function updateProfile(agentId, updates) {
  const allowed = ['name', 'whatsapp', 'bio', 'avatarUrl', 'phone'];
  const data = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }

  if (data.phone) {
    const taken = await prisma.agent.findUnique({ where: { phone: data.phone } });
    if (taken && taken.id !== agentId) {
      const err = new Error('An account with this phone number already exists');
      err.statusCode = 409;
      throw err;
    }
  }

  const agent = await prisma.agent.update({ where: { id: agentId }, data });
  return toPublicAgent(agent);
}

async function changePassword(agentId, { currentPassword, newPassword }, req) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });

  if (agent.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, agent.passwordHash);
    if (!valid) {
      const err = new Error('Current password is incorrect');
      err.statusCode = 401;
      throw err;
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.agent.update({ where: { id: agentId }, data: { passwordHash } });

  await prisma.refreshToken.updateMany({ where: { agentId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAuthEvent({ agentId, type: 'PASSWORD_CHANGED', req });

  return { success: true };
}

// ---------------------------------------------------------------------
// Email verification (OTP)
// ---------------------------------------------------------------------

/**
 * Verifies the OTP code against the currently-authenticated agent's own
 * account. This is NOT a public token lookup — a 6-digit code has far less
 * entropy than a random hex token, so it must be scoped to a known agent
 * (via their access token) and attempt-limited, or it's brute-forceable.
 */
async function verifyEmailCode(agentId, code, req) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });

  if (agent.emailVerified) {
    return { success: true, alreadyVerified: true };
  }
  if (!agent.emailVerificationToken) {
    const err = new Error('No pending verification — request a new code');
    err.statusCode = 400;
    throw err;
  }
  if (agent.emailVerificationExpires && agent.emailVerificationExpires < new Date()) {
    const err = new Error('This code has expired — request a new one');
    err.statusCode = 400;
    throw err;
  }
  if (agent.emailVerificationAttempts >= MAX_OTP_ATTEMPTS) {
    const err = new Error('Too many incorrect attempts — request a new code');
    err.statusCode = 429;
    throw err;
  }

  if (hashToken(code) !== agent.emailVerificationToken) {
    await prisma.agent.update({
      where: { id: agentId },
      data: { emailVerificationAttempts: { increment: 1 } },
    });
    const err = new Error('Incorrect code');
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      emailVerificationAttempts: 0,
    },
  });

  await logAuthEvent({ agentId, type: 'EMAIL_VERIFIED', req });
  return { success: true, alreadyVerified: false, agent: toPublicAgent(updated) };
}

async function resendVerification(agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  if (!agent.email) {
    const err = new Error('No email on file — set one first via the change-email flow');
    err.statusCode = 400;
    throw err;
  }
  if (agent.emailVerified) {
    return { success: true, alreadyVerified: true };
  }

  await createAndSendVerification(agent);
  return { success: true, alreadyVerified: false };
}

// ---------------------------------------------------------------------
// Change email — now OTP-based, same pattern as signup verification.
// Both request and confirm are authenticated (the agent is already
// logged in throughout this flow, unlike password reset).
// ---------------------------------------------------------------------

async function requestEmailChange(agentId, { newEmail, currentPassword }) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });

  if (agent.passwordHash) {
    if (!currentPassword) {
      const err = new Error('currentPassword is required to change your email');
      err.statusCode = 400;
      throw err;
    }
    const valid = await bcrypt.compare(currentPassword, agent.passwordHash);
    if (!valid) {
      const err = new Error('Current password is incorrect');
      err.statusCode = 401;
      throw err;
    }
  }

  const taken = await prisma.agent.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== agentId) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 409;
    throw err;
  }

  const code = generateOtpCode();
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      pendingEmail: newEmail,
      pendingEmailToken: hashToken(code),
      pendingEmailExpires: expires,
      pendingEmailAttempts: 0,
    },
  });

  await sendChangeEmailConfirmation(updated, code, newEmail).catch((err) =>
    console.error(`[agents] failed to send change-email code to ${newEmail}:`, err.message)
  );

  await logAuthEvent({ agentId, type: 'EMAIL_CHANGE_REQUESTED', metadata: { newEmail } });
  return { success: true };
}

async function confirmEmailChange(agentId, code, req) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });

  if (!agent.pendingEmailToken) {
    const err = new Error('No pending email change — request one first');
    err.statusCode = 400;
    throw err;
  }
  if (agent.pendingEmailExpires && agent.pendingEmailExpires < new Date()) {
    const err = new Error('This code has expired — request the email change again');
    err.statusCode = 400;
    throw err;
  }
  if (agent.pendingEmailAttempts >= MAX_OTP_ATTEMPTS) {
    const err = new Error('Too many incorrect attempts — request the email change again');
    err.statusCode = 429;
    throw err;
  }

  if (hashToken(code) !== agent.pendingEmailToken) {
    await prisma.agent.update({ where: { id: agentId }, data: { pendingEmailAttempts: { increment: 1 } } });
    const err = new Error('Incorrect code');
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      email: agent.pendingEmail,
      emailVerified: true,
      pendingEmail: null,
      pendingEmailToken: null,
      pendingEmailExpires: null,
      pendingEmailAttempts: 0,
    },
  });

  await logAuthEvent({ agentId, type: 'EMAIL_CHANGED', req });
  return toPublicAgent(updated);
}

// ---------------------------------------------------------------------
// Forgot / reset password — OTP-based
// ---------------------------------------------------------------------

async function requestPasswordReset({ phone, email }, req) {
  const agent = phone
    ? await prisma.agent.findUnique({ where: { phone } })
    : await prisma.agent.findUnique({ where: { email } });

  if (agent && agent.email) {
    const code = generateOtpCode();
    const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: { passwordResetToken: hashToken(code), passwordResetExpires: expires, passwordResetAttempts: 0 },
    });

    await sendPasswordResetEmail(updated, code).catch((err) =>
      console.error(`[agents] failed to send password reset code to ${updated.email}:`, err.message)
    );
    await logAuthEvent({ agentId: agent.id, type: 'PASSWORD_RESET_REQUESTED', req });
  }

  return { success: true, message: 'If an account exists, a reset code has been sent to its email.' };
}

/**
 * Unlike email verification and change-email (both authenticated, so the
 * code is checked against the logged-in agent's own account), password
 * reset happens with NO session — the agent forgot their password. So the
 * request must identify the account by phone/email AND supply the code
 * together; the code alone isn't enough to find who it belongs to.
 */
async function resetPassword({ phone, email, code, newPassword }, req) {
  const agent = phone
    ? await prisma.agent.findUnique({ where: { phone } })
    : await prisma.agent.findUnique({ where: { email } });

  const invalidError = () => {
    const err = new Error('Invalid code or account');
    err.statusCode = 400;
    return err;
  };

  if (!agent || !agent.passwordResetToken) throw invalidError();
  if (agent.passwordResetExpires && agent.passwordResetExpires < new Date()) {
    const err = new Error('This code has expired — request a new one');
    err.statusCode = 400;
    throw err;
  }
  if (agent.passwordResetAttempts >= MAX_OTP_ATTEMPTS) {
    const err = new Error('Too many incorrect attempts — request a new code');
    err.statusCode = 429;
    throw err;
  }

  if (hashToken(code) !== agent.passwordResetToken) {
    await prisma.agent.update({ where: { id: agent.id }, data: { passwordResetAttempts: { increment: 1 } } });
    throw invalidError();
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.agent.update({
    where: { id: agent.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpires: null, passwordResetAttempts: 0 },
  });

  await prisma.refreshToken.updateMany({ where: { agentId: agent.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAuthEvent({ agentId: agent.id, type: 'PASSWORD_RESET', req });

  return { success: true };
}

// ---------------------------------------------------------------------
// Admin: account status
// ---------------------------------------------------------------------

async function setAccountStatus(targetAgentId, status, req) {
  const agent = await prisma.agent.update({ where: { id: targetAgentId }, data: { status } });
  if (status !== 'ACTIVE') {
    await prisma.refreshToken.updateMany({ where: { agentId: targetAgentId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await logAuthEvent({
    agentId: targetAgentId,
    type: status === 'ACTIVE' ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_SUSPENDED',
    req,
  });
  return toPublicAgent(agent);
}

module.exports = {
  signup,
  login,
  googleAuth,
  refreshAccessToken,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  getById,
  getPublicBySlug,
  updateProfile,
  changePassword,
  verifyEmailCode,
  resendVerification,
  requestEmailChange,
  confirmEmailChange,
  requestPasswordReset,
  resetPassword,
  setAccountStatus,
};
