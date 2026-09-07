const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function clientIp(req) {
  // Requires app.set('trust proxy', 1) in server.js to read the real client
  // IP behind Render's proxy — otherwise this is Render's internal IP.
  return req?.ip || null;
}

/**
 * Records an authentication event. Never pass passwords, tokens, or JWTs in
 * `metadata` — this table is for audit/security review, not secret storage.
 */
async function logAuthEvent({ agentId = null, type, metadata = null, req = null }) {
  try {
    await prisma.authEvent.create({
      data: { agentId, type, metadata, ipAddress: req ? clientIp(req) : null },
    });
  } catch (err) {
    // Logging must never break the actual auth flow it's observing.
    console.error('[auth-event] failed to log', type, err.message);
  }
}

module.exports = { logAuthEvent };
