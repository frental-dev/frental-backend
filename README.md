# Frental Backend

A backend for a rental-agent platform: agents manage listings, get a public
page they can share on WhatsApp, appear in a public marketplace, and track
clients, viewings, and leads in one place.

---

## 1. How the backend works

### Architecture overview

```
Client (Postman / mobile app)
        │
        ▼
   Express API (src/server.js)
        │
        ├── Agents        — auth, profile, public agent page
        ├── Properties    — listings, owned by an agent
        ├── Media         — photo/video upload, owned by a property
        ├── Clients       — CRM records, owned by an agent
        ├── Viewings      — links a Client + Property + time slot
        ├── Marketplace   — public read-only search over AVAILABLE properties
        └── Leads         — inbound inquiries, convertible into Clients
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

Each module follows the same three-layer pattern:

- **`*.routes.js`** — defines the URL + HTTP method, applies `requireAuth` where needed
- **`*.controller.js`** — parses the request, calls the service, shapes the HTTP response
- **`*.service.js`** — the actual business logic and Prisma queries

### Request lifecycle (example: creating a property)

1. `POST /api/properties` hits `property.routes.js`
2. `requireAuth` middleware verifies the JWT, attaches `req.agent.id`
3. `property.controller.js` passes `req.body` to the service
4. `property.service.js` validates required fields and writes to Postgres via Prisma
5. Controller returns `201` with the created record

### Media upload — why it's async

Uploading a photo/video involves multiple network calls (MinIO write, then
Cloudinary processing). To keep the API responsive, uploading is split in two:

1. **Synchronous part** (`media.service.js` → `uploadPropertyMedia`): the file
   is streamed straight to MinIO, a `Media` row is created with
   `status: PROCESSING`, and the request returns a `202` immediately.
2. **Async part** (`src/jobs/mediaWorker.js`, a **separate process** you run
   with `npm run worker`): a BullMQ job picks up the new media, tries to push
   it to Cloudinary for thumbnailing, and updates the row to `status: ACTIVE`.

**You must run the worker separately from the API** (`npm run worker` in its
own terminal) — without it, uploaded files stay stuck in `PROCESSING` forever.

### Storage fallback: Cloudinary → MinIO

See section 4 below for the full explanation.

### Auth model

- Agents sign up / log in with `phone` or `email` + `password` (or via
  Google Sign-In), and get back a short-lived **access token** (JWT, 15
  min) plus a long-lived **refresh token** (opaque, 30 days, hashed at
  rest, single-use — see Section 3.1 for the full lifecycle).
- Every private route checks `Authorization: Bearer <accessToken>` via
  `src/middleware/auth.js`, which attaches `req.agent.id` and
  `req.agent.role`, and confirms the account is still `ACTIVE` on every
  request (not just at login).
- Every service function that touches an agent-owned record (Property,
  Client, Viewing, Lead) re-checks `agentId` ownership on every read/write —
  so a valid token can never touch another agent's data, even with a guessed
  ID.
- `requireRole('ADMIN')` (`src/middleware/requireRole.js`) gates a small
  number of admin-only actions, currently just account status changes.
- Public routes (`agents/public/:slug`, all of `/marketplace/*`,
  `/leads/public`, plus the auth entry points themselves) have no auth at
  all — anyone can call them, by design.

---

## 2. Setup from a clean clone

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in real values
cp .env.example .env

# 3. Start MinIO + Redis (Postgres is assumed to be a remote provider like Neon —
#    add a postgres service to docker-compose.yml if you want it local too)
docker compose up -d

# 4. Create the database tables
npx prisma migrate dev

# 5. Load demo data (agents, properties, clients, viewings, leads)
npm run seed

# 6. Start the API (terminal 1)
npm run dev

# 7. Start the media worker (terminal 2 — required for uploads to complete)
npm run worker
```

Confirm it's up: `GET http://localhost:4000/health` → `{"status":"ok"}`

### Setting up Brevo (required for signup to send verification emails)

1. Create a free account at [brevo.com](https://www.brevo.com) (free tier covers a generous volume of transactional email — plenty for this stage)
2. Go to **Settings → SMTP & API → API Keys**, generate a key, put it in `.env` as `BREVO_API_KEY`
3. Verify a sender email/domain in Brevo (required before it'll actually deliver) — use that address as `BREVO_SENDER_EMAIL`
4. Set `API_BASE_URL` to wherever this server is actually reachable — `http://localhost:4000` locally, your Render URL in production. This is what gets embedded in the verification link, so it must be correct or the link in the email won't work.

If `BREVO_API_KEY` is missing, signup still works (the app never blocks on
email delivery) — it just logs a warning and skips sending, which is fine
for local dev if you don't want to set up Brevo right away.

### Setting up Google Sign-In (required for `POST /api/agents/google`)

1. In [Google Cloud Console](https://console.cloud.google.com), create (or
   reuse) a project, then go to **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** of type **Web application** — yes, even
   though the client is a native Android app. Google's ID-token verification
   flow authenticates against the Web client ID, not an Android-specific one;
   the Android app is configured separately in Google's console to use this
   same Web client ID when requesting tokens.
3. Copy that client ID into `.env` as `GOOGLE_CLIENT_ID`
4. Configure the OAuth consent screen (app name, support email) — required
   before Google will issue tokens at all, even in testing mode

If `GOOGLE_CLIENT_ID` is unset, every request to `/agents/google` fails with
a 401 — everything else in the app is unaffected.

### Seed data

`npm run seed` wipes and recreates demo data every time you run it (safe to
re-run). It creates:

- **2 agents** — both use password `password123`
  - Victor Kamau — phone `0700111222` — slug `victor-kamau`
  - Aisha Noor — phone `0700333444` — slug `aisha-noor`
- **5 properties** across both agents, in a mix of `AVAILABLE`, `TAKEN`, and `HOLD` states
- **3 clients**, one of each `ClientStatus` value
- **2 viewings**, one upcoming (`SCHEDULED`) and one in the past (`COMPLETED`)
- **3 leads**, unconverted — try `POST /api/leads/:id/convert` on one

No `Media` records are seeded (can't fake real image files) — upload real
files through Postman to test that pipeline.

---

## 3. API reference & Postman testing guide

Base URL for everything below: `http://localhost:4000`

**Recommended Postman setup:**
1. Create a Postman **Environment** with a variable `baseUrl = http://localhost:4000`
2. After calling login/signup, copy the returned `token` into an environment
   variable called `token`
3. On any authenticated request, set **Authorization → Type: Bearer Token →
   Token: `{{token}}`**

### 3.1 Agents — full authentication system

Auth uses short-lived **access tokens** (JWT, 15 min) plus long-lived
**refresh tokens** (opaque, 30 days, hashed in the database, rotated on
every use). This replaced an earlier single 30-day JWT design — see the
migration note below if you built against the old version.

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/agents/signup` | none, rate-limited | `{ name, phone?, whatsapp?, email, password }` — email required, phone optional (Google-only accounts have none) |
| POST | `/api/agents/login` | none, rate-limited | `{ phone or email, password }` |
| POST | `/api/agents/google` | none, rate-limited | `{ idToken }` — see Google Sign-In below |
| POST | `/api/agents/refresh` | none | `{ refreshToken }` → new `{ accessToken, refreshToken }` pair; the old refresh token is revoked (rotation) |
| POST | `/api/agents/logout` | none | `{ refreshToken }` — revokes that one session |
| POST | `/api/agents/logout-all` | Bearer | — revokes every session for this agent |
| GET | `/api/agents/me/sessions` | Bearer | — list active sessions (device/IP/created/last-used, never the token itself) |
| DELETE | `/api/agents/me/sessions/:sessionId` | Bearer | — revoke one specific session |
| GET | `/api/agents/public/:slug` | none | — |
| GET | `/api/agents/verify-email?token=...` | none | Opened from the verification email — HTML page, not JSON |
| GET | `/api/agents/me` | Bearer | — |
| PATCH | `/api/agents/me` | Bearer | any of `{ name, whatsapp, phone, bio, avatarUrl }` — **`email` is no longer editable here**, see change-email below |
| POST | `/api/agents/me/change-password` | Bearer | `{ currentPassword, newPassword }` — revokes every session, including the current one |
| POST | `/api/agents/me/change-email` | Bearer | `{ newEmail, currentPassword? }` — sends a confirmation link to the *new* address; nothing changes until it's clicked |
| GET | `/api/agents/confirm-email-change?token=...` | none | Opened from that confirmation email — HTML page |
| POST | `/api/agents/me/resend-verification` | Bearer, rate-limited (3/hr/agent) | — |
| POST | `/api/agents/forgot-password` | none, rate-limited | `{ phone or email }` — always the same generic response, whether or not an account matches |
| GET | `/api/agents/reset-password?token=...` | none | Self-contained HTML form — no marketplace/mobile-app dependency |
| POST | `/api/agents/reset-password` | none, rate-limited | `{ token, newPassword }` — revokes every session |
| PATCH | `/api/agents/:agentId/status` | Bearer, **ADMIN role only** | `{ status: "ACTIVE"\|"SUSPENDED"\|"DISABLED" }` — also kills that agent's active sessions immediately |

**Migration note if you built against the earlier version:** login used to
return one `token` valid for 30 days. It now returns `{ accessToken,
refreshToken }` — `accessToken` expires in **15 minutes**. Any client
(including the mobile app spec) needs to catch `401`s, call
`POST /agents/refresh` with the stored `refreshToken`, retry the original
request, and only fall back to a full login screen if refresh itself fails.

**Google Sign-In, in short:** the app collects a Google ID token via the
platform's Google Sign-In SDK and sends it as `{ idToken }`. The backend
verifies it against `GOOGLE_CLIENT_ID` (Google Cloud Console → OAuth
credentials → Web Client ID — this must be the **Web** client ID even for
a native Android app, per Google's own setup for ID-token verification).
If the Google account's email matches an existing password-based agent,
the accounts link automatically. A brand-new Google agent has no `phone`
and no `passwordHash` until they add one later.

**Security features worth knowing about, not just endpoints:**
- Failed login attempts lock an account for 15 minutes after 5 failures
  (tracked per-account, separate from IP-based rate limiting)
- Verification, password-reset, and email-change tokens are stored as
  **SHA-256 hashes**, never raw — see `src/utils/tokens.js`
- Every significant auth action (signup, login success/failure, password
  change/reset, email verified/changed, logout, account suspension) is
  logged to an `AuthEvent` table — nothing sensitive (passwords, tokens)
  ever goes into that log, only event type + timestamp + IP + agent
- Rate limiting is in-memory (`express-rate-limit`), correct for the
  current single-instance Render deployment. If this ever runs as
  multiple instances, each tracks its own counts independently — the
  effective limit becomes (limit × instance count). Fix then with a
  shared Redis-backed store; not needed at current scale.

**Deliberate scope boundary:** every other module (Properties, Clients,
Viewings, Leads, Media, Marketplace) still returns its original response
shape (`{ property }`, `{ error: "..." }`, etc.), not the
`{ success, data }` / `{ success, error }` envelope used nowhere in this
codebase. Unifying that across all 7 modules would be a deliberate,
separate pass — it wasn't done here to avoid breaking the marketplace
frontend and Android spec, which were both built against the current shapes.

**Postman test — signup + login + refresh flow:**
- POST `{{baseUrl}}/api/agents/signup` with
  `{ "name": "Test Agent", "phone": "0700000000", "email": "you@example.com", "password": "testpass123" }`
- Save `accessToken` → `{{token}}` and `refreshToken` → `{{refreshToken}}`
- Check your inbox for the verification email; clicking it opens a plain
  confirmation page (not meant to be called from Postman)
- To test refresh: POST `{{baseUrl}}/api/agents/refresh` with
  `{ "refreshToken": "{{refreshToken}}" }` — note the response gives you a
  **new** refresh token; the one you just used is now revoked (rotation)
  and will fail if you try it again

**Postman test — sessions:**
- GET `{{baseUrl}}/api/agents/me/sessions`, Bearer `{{token}}` — shows every
  active login (this Postman session included) with raw user-agent/IP
- POST `{{baseUrl}}/api/agents/logout-all`, Bearer `{{token}}` — then retry
  `/refresh` with your old `{{refreshToken}}`; it should now fail

**Postman test — forgot/reset password:**
- POST `{{baseUrl}}/api/agents/forgot-password` with `{ "phone": "0700000000" }`
- Response is always the same generic message regardless of whether the
  phone matches an account — check the inbox to see if one actually went out
- Open the reset link in a **browser**, not Postman, to use the HTML form —
  or POST `{{baseUrl}}/api/agents/reset-password` directly with
  `{ "token": "...", "newPassword": "newpass123" }`

**Postman test — change email:**
- POST `{{baseUrl}}/api/agents/me/change-email`, Bearer `{{token}}`, with
  `{ "newEmail": "new@example.com", "currentPassword": "testpass123" }`
- The *old* email stays active and logged-in until the confirmation link
  (sent to the new address) is clicked

**Postman test — public page (what gets shared on WhatsApp):**
- GET `{{baseUrl}}/api/agents/public/victor-kamau` (after seeding)
- No auth needed — this is the page a client sees when an agent shares their link.

### 3.2 Properties

All routes require Bearer auth.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/api/properties` | `{ title, description?, rent, deposit, houseType, estate, city?, features?, bedrooms?, bathrooms?, approxLat?, approxLng? }` |
| GET | `/api/properties` | `?status=AVAILABLE\|TAKEN\|HOLD` (optional) |
| GET | `/api/properties/:propertyId` | — |
| PATCH | `/api/properties/:propertyId` | any updatable field, incl. `exactLat/exactLng/exactAddress` |
| PATCH | `/api/properties/:propertyId/status` | `{ status: "AVAILABLE" \| "TAKEN" \| "HOLD" }` |
| DELETE | `/api/properties/:propertyId` | — |

`houseType` must be one of: `BEDSITTER`, `ONE_BEDROOM`, `TWO_BEDROOM`,
`THREE_BEDROOM`, `MAISONETTE`, `BUNGALOW`, `PLOT`, `COMMERCIAL`.

`bedrooms` and `bathrooms` are plain integers, both optional/nullable —
leave them unset for `PLOT` or `COMMERCIAL` listings where they don't
apply. These are structured fields distinct from `features` (a free-form
string array for amenities like `"parking"`, `"borehole"`) — they exist
specifically so search/filtering and any future matching logic have a real
number to compare against, not a string to parse.

**Postman test — create a property:**
- POST `{{baseUrl}}/api/properties`, Bearer `{{token}}`
- Body:
  ```json
  { "title": "2BR Kilimani", "rent": 35000, "deposit": 35000, "houseType": "TWO_BEDROOM", "estate": "Kilimani" }
  ```
- Copy the returned `id` — you'll need it for the Media tests below.

### 3.3 Media

All routes require Bearer auth.

| Method | Path | Body |
|---|---|---|
| POST | `/api/properties/:propertyId/media` | `form-data`, key `files` (type File), repeatable |
| GET | `/api/properties/:propertyId/media` | — |
| DELETE | `/api/media/:mediaId` | — |

**Postman test — upload:**
1. POST `{{baseUrl}}/api/properties/<propertyId>/media`
2. Authorization → Bearer `{{token}}`
3. Body → **form-data** (not raw JSON — this is a file upload)
4. Add a row: Key = `files`, change the type dropdown from "Text" to **"File"**, choose an image
5. Add more rows named `files` to upload several at once (up to 10)
6. Send → expect `202` with `status: "PROCESSING"`
7. Wait a couple seconds (worker needs to run this — see setup step 7), then
   GET the same property's media — `status` should flip to `"ACTIVE"` with a
   `url` field populated.

### 3.4 Clients

All routes require Bearer auth.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/api/clients` | `{ name, phone, budgetMin?, budgetMax?, houseType?, preferredEstate?, notes? }` |
| GET | `/api/clients` | `?status=&search=` (search matches name or phone) |
| GET | `/api/clients/:clientId` | — |
| PATCH | `/api/clients/:clientId` | any of the create fields, plus `status` |
| DELETE | `/api/clients/:clientId` | — |

`status` values: `NEW`, `VIEWING_SCHEDULED`, `CLOSED`, `LOST`.

### 3.5 Viewings

All routes require Bearer auth.

| Method | Path | Body / Query |
|---|---|---|
| POST | `/api/viewings` | `{ clientId, propertyId, scheduledAt, notes? }` |
| GET | `/api/viewings` | `?status=&from=&to=` (ISO date strings) |
| GET | `/api/viewings/:viewingId` | — |
| PATCH | `/api/viewings/:viewingId` | `{ scheduledAt?, notes? }` |
| PATCH | `/api/viewings/:viewingId/status` | `{ status }` |
| DELETE | `/api/viewings/:viewingId` | — |

`status` values: `SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
`scheduledAt` accepts any ISO 8601 string, e.g. `"2026-09-01T14:00:00Z"`.

Creating a viewing automatically moves the linked client from `NEW` to
`VIEWING_SCHEDULED` (only if they were still `NEW`).

### 3.6 Marketplace (public — no auth)

| Method | Path | Query |
|---|---|---|
| GET | `/api/marketplace/properties` | `?estate=&city=&houseType=&minRent=&maxRent=&minBedrooms=&minBathrooms=&page=&pageSize=` |
| GET | `/api/marketplace/properties/:propertyId` | — |

Only ever returns properties with `status: AVAILABLE`. Never exposes
`exactLat/exactLng/exactAddress`.

**Postman test:**
- GET `{{baseUrl}}/api/marketplace/properties?estate=Kilimani`
- No auth header needed.

### 3.7 Leads

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/leads/public` | none | `{ propertyId, source, name?, phone?, message? }` |
| POST | `/api/leads` | Bearer | `{ propertyId?, source, name?, phone?, message? }` |
| GET | `/api/leads` | Bearer | `?status=&source=` |
| GET | `/api/leads/:leadId` | Bearer | — |
| PATCH | `/api/leads/:leadId` | Bearer | `{ status?, name?, phone?, message? }` |
| POST | `/api/leads/:leadId/convert` | Bearer | `{ name?, phone?, budgetMin?, budgetMax?, houseType?, preferredEstate?, notes? }` |
| DELETE | `/api/leads/:leadId` | Bearer | — |

`source` values: `WHATSAPP`, `MARKETPLACE`, `TIKTOK`, `INSTAGRAM`, `FACEBOOK`, `DIRECT`.

**Postman test — public inquiry (simulates a marketplace visitor):**
- POST `{{baseUrl}}/api/leads/public`
- Body: `{ "propertyId": "<a real property id>", "source": "MARKETPLACE", "name": "Interested Person", "phone": "0700999888" }`
- No auth — this is what an anonymous marketplace visitor would trigger.

**Postman test — convert a lead to a client:**
- POST `{{baseUrl}}/api/leads/<leadId>/convert`, Bearer `{{token}}`
- Body: `{ "budgetMin": 20000, "budgetMax": 30000, "houseType": "ONE_BEDROOM" }`
- Response includes both the new `client` and the updated `lead` (now `status: CONVERTED`).

---

## 4. Local storage: MinIO as the Cloudinary fallback

### Why both

- **MinIO** is the source of truth for every uploaded file — every image and
  video is written there first, always, before anything else happens.
- **Cloudinary** is used on top of that, only for images, to generate
  optimized/thumbnailed versions for fast delivery.
- If Cloudinary is unreachable, over its plan quota, or rate-limited, the
  system **falls back to serving the file straight from MinIO** instead of
  failing the upload.

### How the fallback actually works

`src/jobs/mediaWorker.js` runs this logic for every uploaded image:

1. Stream the file's bytes directly out of MinIO (`minioClient.getObject`)
2. Pipe that stream into Cloudinary's `upload_stream` API
3. **If it succeeds:** save `cloudinaryUrl`, `thumbnailUrl`, and set
   `storageProvider: "CLOUDINARY"` on the `Media` row
4. **If it throws for any reason** (quota exceeded, network error, invalid
   credentials, rate limit): catch the error, log a warning, and set
   `storageProvider: "MINIO"` instead — the job still completes successfully,
   it just serves the original file rather than a Cloudinary-optimized one

Videos always go straight to `storageProvider: "MINIO"` — they're never sent
to Cloudinary at all, since video transformation is expensive at Cloudinary's
pricing. (This is also why streaming the file from MinIO to Cloudinary — not
generating a public MinIO URL for Cloudinary to fetch — is what makes this
work at all on a local machine: Cloudinary's servers can never reach your
`localhost`, but *your own server* fetching from MinIO and pushing to
Cloudinary works regardless of network topology.)

### Reading back a file's URL

`resolveMediaUrl()` in `src/modules/media/media.service.js` is the single
place that decides what URL to hand back to a client:

```js
if (media.storageProvider === 'CLOUDINARY' && media.cloudinaryUrl) {
  return media.cloudinaryUrl;           // fast, optimized, permanent
}
// otherwise: generate a fresh 1-hour presigned MinIO URL
return await minioClient.presignedGetObject(media.minioBucket, media.minioKey, 3600);
```

This is called both in `GET /api/properties/:id/media` (agent's own view) and
inside the Marketplace module's public serializer — so a MinIO-fallback image
looks and behaves identically to a Cloudinary one from the client's
perspective. The only practical difference: **MinIO URLs are presigned and
expire after an hour**, so they're generated fresh on every read rather than
stored — never cache a MinIO url long-term client-side.

### How to deliberately test the fallback

1. Open `.env` and temporarily break your Cloudinary credentials, e.g. change
   `CLOUDINARY_API_KEY` to `wrong`
2. Restart the worker (`npm run worker`)
3. Upload an image via Postman
4. Watch the worker's terminal — you should see:
   ```
   [media-worker] Cloudinary unavailable for <id> (...) — falling back to MinIO
   ```
5. `GET` that property's media — `storageProvider` will show `"MINIO"` and
   `url` will be a presigned MinIO link (starts with your `MINIO_ENDPOINT`,
   has a long query string with an expiry)
6. Restore your real Cloudinary credentials in `.env` and restart the worker

### Viewing files directly in MinIO

MinIO ships a web console. With the Docker Compose setup in this repo:

- Console: `http://localhost:9001`
- Login: whatever you set for `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in
  `docker-compose.yml` (should match `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
  in your `.env`)
- Browse to your bucket (`MINIO_BUCKET` in `.env`) to see every uploaded file
  by its raw key, e.g. `properties/<propertyId>/<uuid>.jpg`

### Extending this further

If you want a true multi-provider fallback chain later (e.g. Cloudinary →
MinIO → Cloudflare R2), the pattern to follow is the same one already used in
`mediaWorker.js`: wrap each provider attempt in its own try/catch, and only
move to the next provider on failure. The `storageProvider` enum in
`schema.prisma` would need a new value added for each provider you introduce.

---

## 6. Deploying: GitHub → Render

### Push to GitHub

```bash
cd ~/projects/frental
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repo on GitHub (no README/license — you already have one),
then:

```bash
git remote add origin https://github.com/<your-username>/frental.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules/` and `.env` — your real
credentials never get committed. Double-check with `git status` before your
first commit that `.env` isn't staged.

### The one thing that needs to change before deploying: MinIO

**Render has no built-in MinIO or object-storage product.** Locally you're
running MinIO in Docker, but Render's free/starter web services don't support
persistent disks the way self-hosted MinIO needs (a restart would wipe every
uploaded file). You have two real options:

| Option | What changes | Effort |
|---|---|---|
| **Switch to a hosted S3-compatible provider** (Cloudflare R2, Backblaze B2, DigitalOcean Spaces, AWS S3) | Only `.env` values — `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_USE_SSL=true`. **Zero code changes** — the `minio` npm package talks to any S3-compatible API, and Cloudflare R2 in particular has a generous free tier. | Low — recommended |
| **Self-host MinIO on Render** as its own service with a paid persistent disk | Add a third Render service running the MinIO Docker image, attach a paid disk | Higher cost, more moving parts |

**Recommended: Cloudflare R2.** Free tier (10GB storage, no egress fees),
fully S3-compatible, and your existing `src/config/minio.js` needs no code
changes — just new credentials:

```dotenv
MINIO_ENDPOINT=<accountid>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2 access key id>
MINIO_SECRET_KEY=<r2 secret access key>
MINIO_BUCKET=frental-media
MINIO_REGION=auto
```

Create the R2 bucket and API token from the Cloudflare dashboard, then plug
those values into Render's environment variables (see below) — `ensureBuckets()`
in `src/config/minio.js` will confirm the bucket exists on boot exactly like
it does with local MinIO.

### A note on free tier: Background Worker services are paid-only

Render's **Background Worker** service type — used to run the media worker
as a separate always-on process — has no free plan. If you're deploying on
Render's free tier, skip creating a second service entirely and instead run
the worker **inside the same process** as the API:

Set `RUN_WORKER_INLINE=true` as an env var on your single web service. In
`src/server.js`, after the API starts listening, this flag triggers
`require('./jobs/mediaWorker')` in that same Node process — so one free web
service handles both HTTP requests and background media processing. Fine at
low traffic volume; if uploads become frequent enough to slow down API
response times, that's your signal to upgrade to a real paid Background
Worker service and unset this flag.

### Deploy with the included Blueprint

This repo includes `render.yaml`, which defines everything Render needs in
one go: the API web service, the media worker as a separate background
service, and a managed Redis instance. **Note: this uses a paid Background
Worker service** — if you're on the free tier, use the manual setup below
instead with `RUN_WORKER_INLINE=true`.

1. On [render.com](https://render.com), click **New → Blueprint**
2. Connect your GitHub repo — Render detects `render.yaml` automatically
3. Render will prompt you to fill in every env var marked `sync: false` —
   this is where you paste in:
   - `DATABASE_URL` — your Neon connection string (same one from your local `.env`)
   - `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / etc. — your
     R2 (or other provider) credentials, **not** your old local Docker MinIO ones
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
   - `JWT_SECRET` is auto-generated by the blueprint — you don't need to set it
4. Click **Apply** — Render provisions the Redis instance, then builds and
   deploys both the `frental-api` web service and `frental-media-worker`
   background worker

The blueprint's build command for the API runs
`npx prisma migrate deploy` automatically — this applies any pending
migrations on every deploy, so you never have to SSH in and run it manually.

### Deploying manually instead (free-tier friendly)

If you'd rather set things up by hand in the Render dashboard — and this is
the right path if you're on the free tier:

- **Web Service** (e.g. `frental-backend`):
  - Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
  - Start command: `npm start`
  - Add `RUN_WORKER_INLINE=true` so this single service also processes media
    jobs — no second service needed
- **Redis**: create a Render **Key Value** instance (their Redis-compatible
  free-tier product), copy its **Internal Connection String**, and set it as
  `REDIS_URL` on your web service (or use a free Upstash Redis instead —
  same variable). Render's managed Redis requires auth, which is why
  production uses a single `REDIS_URL` rather than the separate
  `REDIS_HOST`/`REDIS_PORT` pair used for local Docker Redis — the code
  (`src/jobs/mediaQueue.js`) automatically prefers `REDIS_URL` when it's set.

**If you're on a paid plan** and want the worker fully isolated from the API
(recommended once you have real traffic, so a burst of uploads can't slow
down API responses):

- **Background Worker** (`frental-media-worker`):
  - Build command: `npm install && npx prisma generate`
  - Start command: `npm run worker`
  - Copy every env var from the web service except `JWT_SECRET` (only the
    API issues tokens) — including `REDIS_URL`, MinIO/R2, and Cloudinary
    credentials
  - Remove `RUN_WORKER_INLINE` from the web service once this is running,
    so jobs aren't processed twice

### After deploying

- Your API's public URL will be something like `https://frental-api.onrender.com`
- Test it exactly like you did locally: `GET /health`, then signup/login
  against the live URL instead of `localhost:4000`
- Free-tier Render web services spin down after inactivity and take ~30–60s
  to wake back up on the next request — expect that cold-start delay, it's
  not a bug

---

## 7. Known limitations (not yet built)

- No input validation library (Zod/Joi) — malformed requests can surface as
  generic 500s instead of clean 400s in some edge cases
- No rate limiting on the two public route groups (`/marketplace/*`,
  `/leads/public`) — add `express-rate-limit` before exposing this publicly
- Video `durationSeconds` is never populated — would need `ffprobe` wired
  into the worker
- The "reveal exact address after a confirmed viewing" rule is modeled in the
  schema (`exactAddress` etc. on `Property`) but not yet enforced anywhere —
  currently exact location is only ever visible to the owning agent
- No automated tests yet — everything so far has been verified manually via
  Postman
