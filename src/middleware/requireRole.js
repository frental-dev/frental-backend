/**
 * Restricts a route to a specific role. Must run after requireAuth, which
 * attaches req.agent.role. Answers "what are you allowed to do", separate
 * from requireAuth's "who are you".
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    if (req.agent.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = requireRole;
