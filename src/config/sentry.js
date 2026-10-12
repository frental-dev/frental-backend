/**
 * Error tracking, opt-in via SENTRY_DSN. If unset, this does nothing and
 * every call site treats a null Sentry as "not configured" and skips it.
 * Free Sentry tier covers a project this size comfortably.
 *
 * Set up: sentry.io → new project (Node.js/Express) → copy the DSN → set
 * SENTRY_DSN in Render's env vars for both the web service and the worker
 * (if running as a separate service) — each reports as its own component.
 */
function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.info('[observability] SENTRY_DSN not set — error tracking disabled');
    return null;
  }

  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  console.info('[observability] Sentry initialized');
  return Sentry;
}

module.exports = { initSentry };
