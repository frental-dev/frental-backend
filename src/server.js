require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { ensureBuckets } = require("./config/minio");
const mediaRoutes = require("./modules/media/media.routes");
const agentRoutes = require("./modules/agents/agent.routes");
const propertyRoutes = require("./modules/properties/property.routes");
const clientRoutes = require("./modules/clients/client.routes");
const viewingRoutes = require("./modules/viewings/viewing.routes");
const marketplaceRoutes = require("./modules/marketplace/marketplace.routes");
const leadRoutes = require("./modules/leads/lead.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", mediaRoutes);
app.use("/api", agentRoutes);
app.use("/api", propertyRoutes);
app.use("/api", clientRoutes);
app.use("/api", viewingRoutes);
app.use("/api", marketplaceRoutes);
app.use("/api", leadRoutes);

// Central error handler — every controller calls next(err) into this
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureBuckets();
  app.listen(PORT, () => console.log(`Frental API running on port ${PORT}`));

  // On paid setups, run `npm run worker` as its own process/service instead.
  // On Render's free tier (no Background Worker service available), set
  // RUN_WORKER_INLINE=true so the same web service also consumes the media
  // processing queue — one process doing both jobs, which is fine at low volume.
  if (process.env.RUN_WORKER_INLINE === "true") {
    require("./jobs/mediaWorker");
    console.log("Media worker running in-process (RUN_WORKER_INLINE=true)");
  }
}

start();
