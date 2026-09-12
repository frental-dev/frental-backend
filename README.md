# Frental Backend

A backend for a rental-agent platform: agents manage listings, get a public
page they can share on WhatsApp, appear in a public marketplace, and track
clients, viewings, and leads in one place.

---

## 1. How the backend works

### Architecture overview

```
Client (Postman / mobile app / marketplace website)
        │
        ▼
   Express API (src/server.js)
        │
        ├── Agents        — full auth lifecycle (see below), profile, public agent page
        ├── Properties    — listings, owned by an agent
        ├── Media         — photo/video upload, owned by a property
        ├── Clients       — CRM records, owned by an agent
        ├── Viewings      — links a Client + Property + time slot
        ├── Marketplace   — public read-only search over AVAILABLE properties
        ├── Leads         — inbound inquiries, convertible into Clients
        └── Dashboard     — read-only aggregation across the above, one call for a home screen
        │
        ▼
   PostgreSQL (via Prisma)  ◄── source of truth for all structured data
        │
        ▼
   Media upload flow:
   Multer (memory) → MinIO (raw file, always) → BullMQ job queued
                                                       │
                                                       ▼
                                          Media Worker (separate process)
                                          tries Cloudinary (thumbnail/optimize)
                                          falls back to MinIO if Cloudinary fails
```

Each module follows the same three-layer pattern: `*.routes.js` (URL +
method + middleware), `*.controller.js` (parses request, shapes response),
`*.service.js` (business logic, Prisma queries).

### Auth model — full lifecycle, not just login

Auth uses short-lived **access tokens** (JWT, 15 min) plus long-lived
**refresh tokens** (opaque, hashed at rest, 30 days, rotated on every use).

- Agents sign up / log in with `phone` **or** `email` + `password`, or via
  **Google Sign-In**.
- Every private route checks `Authorization: Bearer <accessToken>` via
  `src/middleware/auth.js`, which attaches `req.agent.id` + `req.agent.role`
  and confirms the account is still `ACTIVE` on every request (not just at
  login — suspension takes effect immediately).
- `requireRole('ADMIN')` gates a small number of admin-only actions
  (currently just account status changes).
- Every service function that touches an agent-owned record (Property,
  Client, Viewing, Lead) re-checks `agentId` ownership on every read/write.
- Public routes (`agents/public/:slug`, all of `/marketplace/*`,
  `/leads/public`, the auth entry points themselves) need no auth.

**Every auth-adjacent email is now a 6-digit OTP code, not a link** —
chosen for mobile reliability (an agent shouldn't have to jump out to a
browser mid-signup on a phone). All three flows follow the same shape:
random code, hashed at rest, 15-minute expiry, 5-attempt limit before a
resend is required.

- **Signup verification** (`POST /agents/me/verify-email`): authenticated
  — checked against the logged-in agent's own account, not a public
  lookup, since a 6-digit code has far less entropy than a random token
  and would be brute-forceable as a public endpoint.
- **Change-email** (`POST /agents/me/confirm-email-change`): also
  authenticated, same reasoning — the agent is logged in throughout.
- **Forgot/reset password** (`POST /agents/reset-password`): the one
  flow that's genuinely unauthenticated (the agent forgot their
  password, there's no session) — so the request must supply
  `phone`/`email` **and** `code` together; the code alone isn't enough
  to identify whose account it belongs to.

See Section 3.1 for the full endpoint reference.

### Media upload — why it's async

1. **Synchronous**: file streams to MinIO, a `Media` row is created with
   `status: PROCESSING`, request returns `202` immediately.
2. **Async** (`src/jobs/mediaWorker.js`, a separate process — `npm run
   worker`): tries Cloudinary for thumbnailing; falls back to serving
   straight from MinIO/R2 if Cloudinary fails for any reason (quota,
   network, bad credentials) — the upload never fails just because
   Cloudinary is unavailable.

---

## 2. Setup from a clean clone

```bash
npm install
cp .env.example .env
docker compose up -d          # local MinIO + Redis
npx prisma migrate dev        # creates all tables
npm run seed                  # demo agents/properties/clients/viewings/leads
npm run dev                   # terminal 1 — the API
npm run worker                # terminal 2 — required for uploads to complete
```

Confirm it's up: `GET http://localhost:4000/health` → `{"status":"ok"}`

### Setting up Brevo (required for verification codes / reset emails to send)

1. Free account at [brevo.com](https://www.brevo.com)
2. Settings → SMTP & API → API Keys → generate one → `.env` as `BREVO_API_KEY`
3. Verify a sender email/domain in Brevo → use as `BREVO_SENDER_EMAIL`
4. Set `API_BASE_URL` to this server's actual public URL — embedded in
   reset/change-email links, so it must be correct

If `BREVO_API_KEY` is missing, signup/login still work — email just logs a
warning and doesn't send. Fine for local dev.

### Setting up Google Sign-In (required for `POST /api/v1/agents/google`)

1. [Google Cloud Console](https://console.cloud.google.com) → new/existing
   project → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID, type **Web application** (yes, even for
   the native Android app — ID-token verification checks against the Web
   client ID) → this is `GOOGLE_CLIENT_ID`
3. Also create an **Android** OAuth client (package name + SHA-1
   fingerprint) so the app itself is trusted by Google — no separate ID
   string needed in code for this one, Google matches by package+fingerprint
4. Configure the OAuth consent screen (required before any tokens issue)

If `GOOGLE_CLIENT_ID` is unset, `/agents/google` fails with 401; nothing
else is affected.

### Seed data

`npm run seed` creates 2 demo agents (password `password123`), 5
properties in mixed statuses, 3 clients, 2 viewings, 3 leads. Safe to
re-run. No `Media` rows are seeded — upload real files via Postman to test
that pipeline.

---

## 3. API reference & Postman testing guide

Base URL: `http://localhost:4000` — all endpoint paths below already
include the `/api/v1/v1` prefix (added for versioning; see Section 5). Recommended: a Postman environment with
`baseUrl`, and `token`/`refreshToken` variables you update after login.

### 3.1 Agents — full authentication system

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/v1/agents/signup` | none, rate-limited | `{ name, phone?, whatsapp?, email, password }` — email required, phone optional |
| POST | `/api/v1/agents/login` | none, rate-limited | `{ phone or email, password }` |
| POST | `/api/v1/agents/google` | none, rate-limited | `{ idToken }` — same response shape as login |
| POST | `/api/v1/agents/refresh` | none | `{ refreshToken }` → new pair; old refresh token is now dead (rotation) |
| POST | `/api/v1/agents/logout` | none | `{ refreshToken }` — revokes that one session |
| POST | `/api/v1/agents/logout-all` | Bearer | — revokes every session |
| GET | `/api/v1/agents/me/sessions` | Bearer | — active sessions (device/IP/created/last-used, never the token) |
| DELETE | `/api/v1/agents/me/sessions/:sessionId` | Bearer | — revoke one session |
| GET | `/api/v1/agents/public/:slug` | none | — |
| GET | `/api/v1/agents/me` | Bearer | — |
| PATCH | `/api/v1/agents/me` | Bearer | `{ name, whatsapp, phone, bio, avatarUrl }` — **`email` is not editable here**, see change-email |
| POST | `/api/v1/agents/me/change-password` | Bearer | `{ currentPassword, newPassword }` — revokes every session including the current one |
| POST | `/api/v1/agents/me/change-email` | Bearer | `{ newEmail, currentPassword? }` — emails a 6-digit code to the new address; nothing changes until confirmed |
| POST | `/api/v1/agents/me/confirm-email-change` | Bearer, rate-limited | `{ code }` — confirms the change-email code above |
| POST | `/api/v1/agents/me/verify-email` | Bearer, rate-limited | `{ code }` — the 6-digit code emailed at signup. Checked against the logged-in agent's own account, attempt-limited (5 tries), expires in 15 min |
| POST | `/api/v1/agents/me/resend-verification` | Bearer, rate-limited (3/hr) | — sends a fresh code |
| POST | `/api/v1/agents/forgot-password` | none, rate-limited | `{ phone }` or `{ email }` — always the same generic response |
| POST | `/api/v1/agents/reset-password` | none, rate-limited | `{ phone or email, code, newPassword }` — code + identifier together, since there's no session to scope the lookup to; revokes every session |
| PATCH | `/api/v1/agents/:agentId/status` | Bearer, **ADMIN only** | `{ status: "ACTIVE"\|"SUSPENDED"\|"DISABLED" }` |

**Security features:** failed logins lock an account for 15 min after 5
failures; all tokens/codes are stored as SHA-256 hashes, never raw; every
significant auth action logs to an `AuthEvent` table (event type +
timestamp + IP + agent, never secrets); rate limiting is in-memory
(correct for a single instance — see comment in `src/middleware/rateLimit.js`
if this ever runs multi-instance).

**Postman test — signup → verify → login:**
```
POST {{baseUrl}}/api/v1/agents/signup
{ "name": "Test Agent", "phone": "0700000000", "email": "you@example.com", "password": "testpass123" }
```
Save `accessToken`→`{{token}}`, `refreshToken`→`{{refreshToken}}`. Check
your inbox for a 6-digit code, then:
```
POST {{baseUrl}}/api/v1/agents/me/verify-email
Authorization: Bearer {{token}}
{ "code": "123456" }
```

**Postman test — refresh rotation:**
```
POST {{baseUrl}}/api/v1/agents/refresh
{ "refreshToken": "{{refreshToken}}" }
```
Response includes a **new** refresh token — the old one is now dead if you
try reusing it.

**Postman test — forgot/reset password:**
```
POST {{baseUrl}}/api/v1/agents/forgot-password
{ "phone": "0700000000" }
```
Always the same generic response. Check the inbox for a 6-digit code, then:
```
POST {{baseUrl}}/api/v1/agents/reset-password
{ "phone": "0700000000", "code": "123456", "newPassword": "newpass123" }
```

**Postman test — change email:**
```
POST {{baseUrl}}/api/v1/agents/me/change-email
Authorization: Bearer {{token}}
{ "newEmail": "new@example.com", "currentPassword": "testpass123" }
```
Check the *new* address's inbox for a code, then:
```
POST {{baseUrl}}/api/v1/agents/me/confirm-email-change
Authorization: Bearer {{token}}
{ "code": "123456" }
```
The old email stays active and logged-in until this is confirmed.

**Postman test — public page (what gets shared on WhatsApp):**
```
GET {{baseUrl}}/api/v1/agents/public/victor-kamau
```
No auth needed.

### 3.2 Properties

All require Bearer auth. An agent only ever sees/modifies their own.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/properties` | `{ title, description?, rent, deposit, houseType, bedrooms?, bathrooms?, estate, city?, features?, approxLat?, approxLng? }` |
| GET | `/properties` | `?status=` |
| GET | `/properties/:propertyId` | — |
| PATCH | `/properties/:propertyId` | any updatable field, incl. `exactLat/exactLng/exactAddress` |
| PATCH | `/properties/:propertyId/status` | `{ status }` |
| DELETE | `/properties/:propertyId` | — |

`houseType`: `BEDSITTER | ONE_BEDROOM | TWO_BEDROOM | THREE_BEDROOM | MAISONETTE | BUNGALOW | PLOT | COMMERCIAL`

### 3.3 Media

All require Bearer auth. Field name for uploads **must be exactly `files`**.

| Method | Path | Body |
|---|---|---|
| POST | `/properties/:propertyId/media` | `form-data`, key `files` (type File), repeatable, max 10 |
| GET | `/properties/:propertyId/media` | — |
| DELETE | `/media/:mediaId` | — |

Allowed: images `jpeg/png/webp` (15MB max), videos `mp4/mov/webm` (200MB max).

### 3.4 Clients

All require Bearer auth.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/clients` | `{ name, phone, budgetMin?, budgetMax?, houseType?, preferredEstate?, notes? }` |
| GET | `/clients` | `?status=&search=` |
| GET | `/clients/:clientId` | — includes `viewings` |
| PATCH | `/clients/:clientId` | any create field plus `status` |
| DELETE | `/clients/:clientId` | — |

`status`: `NEW | VIEWING_SCHEDULED | CLOSED | LOST`

### 3.5 Viewings

All require Bearer auth.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/viewings` | `{ clientId, propertyId, scheduledAt, notes? }` |
| GET | `/viewings` | `?status=&from=&to=` |
| GET | `/viewings/:viewingId` | — |
| PATCH | `/viewings/:viewingId` | `{ scheduledAt?, notes? }` |
| PATCH | `/viewings/:viewingId/status` | `{ status }` |
| DELETE | `/viewings/:viewingId` | — |

`status`: `SCHEDULED | COMPLETED | CANCELLED | NO_SHOW`. Creating a
viewing auto-moves the client `NEW → VIEWING_SCHEDULED`.

### 3.6 Marketplace (public, no auth)

| Method | Path | Query |
|---|---|---|
| GET | `/marketplace/properties` | `?estate=&city=&houseType=&minRent=&maxRent=&minBedrooms=&minBathrooms=&page=&pageSize=` |
| GET | `/marketplace/properties/:propertyId` | — |

Only `AVAILABLE` properties. Never exposes exact location.

### 3.7 Leads

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/leads/public` | none | `{ propertyId, source, name?, phone?, message? }` |
| POST | `/leads` | Bearer | `{ propertyId?, source, name?, phone?, message? }` |
| GET | `/leads` | Bearer | `?status=&source=` |
| GET | `/leads/:leadId` | Bearer | — |
| PATCH | `/leads/:leadId` | Bearer | `{ status?, name?, phone?, message? }` |
| POST | `/leads/:leadId/convert` | Bearer | `{ name?, phone?, budgetMin?, budgetMax?, houseType?, preferredEstate?, notes? }` |
| DELETE | `/leads/:leadId` | Bearer | — |

`source`: `WHATSAPP | MARKETPLACE | TIKTOK | INSTAGRAM | FACEBOOK | DIRECT`

### 3.8 Dashboard

| Method | Path | Auth |
|---|---|---|
| GET | `/dashboard` | Bearer |

One call powers a home screen: `summary` (counts), `recentProperties`
(last 5 with thumbnail), `todaysViewings` (time formatted in
Africa/Nairobi), `activity` (7-day zero-filled daily counts for
properties/viewings — chart-ready). Runs 8 queries in parallel; revisit
only if this becomes a measured hot path.

---

## 4. Local storage: MinIO as the Cloudinary fallback

`src/jobs/mediaWorker.js` streams each image directly out of MinIO into
Cloudinary's `upload_stream` (never via a public URL — works regardless of
whether MinIO is reachable from the internet). On any Cloudinary failure,
it falls back to serving straight from MinIO (`storageProvider: MINIO`)
instead of failing the job. `resolveMediaUrl()` in `media.service.js` is
the single place that decides which URL to hand back to a client, so
callers never need to know which provider actually served a file.

Videos always go to MinIO only — never sent to Cloudinary (cost).

---

## 5. Deploying: GitHub → Render

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/<you>/frental.git
git branch -M main && git push -u origin main
```

**MinIO doesn't work as-is on Render** (no persistent disk on free tier) —
switch to Cloudflare R2 (S3-compatible, free tier, zero code changes,
just new `MINIO_*` env vars with `MINIO_USE_SSL=true`, `MINIO_PORT=443`,
`MINIO_ENDPOINT=<account>.r2.cloudflarestorage.com` — no `https://` prefix).

**Render's Background Worker service has no free tier.** On free tier, set
`RUN_WORKER_INLINE=true` on your single web service instead of running a
separate worker — the same process then also consumes the media queue.
Unset it and run a real Background Worker once you're on a paid plan.

`render.yaml` defines all three services (API, worker, Redis) for a paid
setup via Render's Blueprint (New → Blueprint). For free tier, set up the
web service manually instead with `RUN_WORKER_INLINE=true`.

---

## 6. Known limitations

- Rate limiting is in-memory — fine for one instance, needs a shared store
  (e.g. Redis-backed) if ever run as multiple instances
- No response-envelope unification (`{success,data}`) across modules —
  deliberate scope boundary, would require touching every consumer
  (marketplace frontend, this README's own examples)
- Video `durationSeconds` is never populated (would need `ffprobe`)
- Client-to-property matching and agent-to-agent marketplace network
  effects — the two pieces of the original product vision not yet built;
  everything here is the single-agent operating system layer
- No automated tests yet
