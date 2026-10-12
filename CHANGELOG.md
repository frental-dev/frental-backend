# Changelog

All notable changes to the Frental backend.

## [0.2.0]

### Added
- `GET /api/v1/agent-properties/search?query=...` — case-insensitive
  partial match on title/estate/city, scoped to the authenticated agent's
  own properties (any status)
- `QUEUE_PREFIX` env var — namespaces the BullMQ media queue per
  environment, so prod/staging/dev sharing one Redis instance don't steal
  each other's media-processing jobs. Previously, whichever environment's
  worker grabbed a job first would silently discard it if the media ID
  didn't exist in its own database — no error, just a job stuck in
  `PROCESSING` forever.
- Request logging middleware (`src/middleware/requestLogger.js`) —
  method/path/status/duration/ip only, never bodies
- `GET /health` now checks real database connectivity (`SELECT 1`),
  returns `503`/`degraded` on failure, and includes uptime + memory
- `GET /api/v1/version` — public, returns name/version/environment/commit
- Process-level `uncaughtException`/`unhandledRejection` handlers
- Optional Sentry error tracking via `SENTRY_DSN` (`src/config/sentry.js`)
  — unset by default, only reports genuine 5xx/crashes, not 4xx validation

- FCM push notifications for the agent Android app:
  `POST`/`DELETE /api/v1/agents/fcm-token`, an `AgentDeviceToken` model,
  and data-only payloads. Triggers: new lead (public and manual), viewing
  scheduled, property status changed. `logout-all` now also clears device
  tokens. Opt-in via `FIREBASE_SERVICE_ACCOUNT_JSON`.
  **Requires a migration** for the new `AgentDeviceToken` table.
  `unreadCount` is a stand-in (count of `NEW` leads), since no notification
  inbox exists.

### Fixed
- Media stuck in `PROCESSING` across a shared-Redis multi-environment
  setup — root cause was the unprefixed BullMQ queue name (see
  `QUEUE_PREFIX` above)

## [0.1.0]

Initial backend: Agents (full auth lifecycle — signup, login, Google
sign-in, OTP email verification, OTP password reset, OTP change-email,
refresh token rotation, sessions, admin account status), Properties,
Media (Cloudinary with MinIO/R2 fallback), Clients, Viewings, Leads,
Marketplace, Dashboard. Versioned under `/api/v1`.
