/**
 * Validates req.body against a Zod schema. On success, replaces req.body
 * with the parsed (and type-coerced/trimmed) result. On failure, responds
 * 400 with a field-level error breakdown rather than a generic message —
 * cheap to give the client something actionable.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Invalid request', details: fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
