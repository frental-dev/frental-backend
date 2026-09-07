const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Verifies the Bearer ACCESS token (short-lived, see agent.service.js) and
 * attaches { id, role } to req.agent.
 *
 * Also checks the account's current status against the database on every
 * request — deliberately not trusting a `status` field embedded in the JWT,
 * since suspension needs to take effect immediately, not just after the
 * token naturally expires. This costs one extra indexed lookup per
 * authenticated request; acceptable at current scale, reconsider only if
 * this specific query shows up as a real bottleneck later.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, status: true },
  });

  if (!agent) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (agent.status !== 'ACTIVE') {
    return res.status(403).json({ error: `Account is ${agent.status.toLowerCase()}` });
  }

  req.agent = { id: agent.id, role: agent.role };
  next();
}

module.exports = requireAuth;
