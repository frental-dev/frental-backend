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
