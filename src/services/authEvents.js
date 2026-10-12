const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function clientIp(req) {
  return req?.ip || null;
}

async function logAuthEvent({ agentId = null, type, metadata = null, req = null }) {
  try {
    await prisma.authEvent.create({
      data: { agentId, type, metadata, ipAddress: req ? clientIp(req) : null },
    });
  } catch (err) {
    console.error('[auth-event] failed to log', type, err.message);
  }
}

module.exports = { logAuthEvent };
