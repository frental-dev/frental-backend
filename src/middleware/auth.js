const jwt = require('jsonwebtoken');

/**
 * Verifies the Bearer token and attaches { id } to req.agent.
 * Swap out for your real auth flow (session, refresh tokens, etc.) —
 * this is the minimal contract the rest of the modules rely on.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.agent = { id: payload.sub };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
