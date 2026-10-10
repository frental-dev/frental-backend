require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { PrismaClient } = require('@prisma/client');

const { initSentry } = require('./config/sentry');
const Sentry = initSentry(); // null if SENTRY_DSN isn't set — every use below checks for that

// Process-level safety net: without this, an uncaught error outside any
// request (e.g. in a timer, a dangling promise) crashes the process with
// no record of why beyond whatever Render's own crash log captures.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
  if (Sentry) Sentry.captureException(err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
  if (Sentry) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

const requestLogger = require('./middleware/requestLogger');
const { ensureBuckets } = require('./config/minio');
const pkg = require('../package.json');
const agentRoutes = require('./modules/agents/agent.routes');
const propertyRoutes = require('./modules/properties/property.routes');
const mediaRoutes = require('./modules/media/media.routes');
const clientRoutes = require('./modules/clients/client.routes');
const viewingRoutes = require('./modules/viewings/viewing.routes');
const marketplaceRoutes = require('./modules/marketplace/marketplace.routes');
const leadRoutes = require('./modules/leads/lead.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

const prisma = new PrismaClient();

// Enhanced health check — confirms the database is actually reachable, not
// just that the process is alive. Point an external uptime monitor (e.g.
// UptimeRobot, free tier) at this instead of just pinging the root URL.
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    timestamp: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'ok';
  } catch (err) {
    console.error('[health] database check failed:', err.message);
    health.database = 'unreachable';
    health.status = 'degraded';
    return res.status(503).json(health);
  }

  res.json(health);
});

// Public — lets you confirm exactly what's actually deployed, useful when
// debugging whether a fix has actually rolled out to a given environment.
app.get('/api/v1/version', (req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
    // Render sets this automatically on every deploy — no manual config needed.
    commit: process.env.RENDER_GIT_COMMIT || null,
  });
});

// All API routes are versioned under /api/v1. A future breaking change
// gets mounted as /api/v2 alongside this, rather than silently breaking
// every existing client (mobile app, marketplace website) on deploy.
const API_PREFIX = '/api/v1';

app.use(API_PREFIX, agentRoutes);
app.use(API_PREFIX, propertyRoutes);
app.use(API_PREFIX, mediaRoutes);
app.use(API_PREFIX, clientRoutes);
app.use(API_PREFIX, viewingRoutes);
app.use(API_PREFIX, marketplaceRoutes);
app.use(API_PREFIX, leadRoutes);
app.use(API_PREFIX, dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  // Only report genuinely unexpected errors — a 400 validation failure or
  // a 404 isn't an incident, it's normal request handling.
  if (Sentry && (!err.statusCode || err.statusCode >= 500)) {
    Sentry.captureException(err);
  }
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureBuckets();
  app.listen(PORT, () => console.log(`Frental API running on port ${PORT}`));

  if (process.env.RUN_WORKER_INLINE === 'true') {
    require('./jobs/mediaWorker');
    console.log('Media worker running in-process (RUN_WORKER_INLINE=true)');
  }
}

start();
