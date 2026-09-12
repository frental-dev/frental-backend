require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { ensureBuckets } = require('./config/minio');
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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
