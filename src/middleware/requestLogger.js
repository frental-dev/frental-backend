/**
 * Logs method, path, status, duration, and IP for every request. Deliberately
 * never logs request/response bodies — those can contain passwords, tokens,
 * and OTP codes, and Render captures stdout into its own log retention, so
 * anything logged here lives beyond this process's lifetime.
 */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[req] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms ip=${req.ip}`
    );
  });

  next();
}

module.exports = requestLogger;
