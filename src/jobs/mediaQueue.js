const IORedis = require('ioredis');
const { Queue } = require('bullmq');

// Local Docker Redis: plain host/port, no auth.
// Render/Upstash/managed Redis: REDIS_URL includes auth + TLS (redis:// or rediss://).
// BullMQ requires maxRetriesPerRequest: null when handed a pre-built ioredis instance.
const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null,
    });

const mediaQueue = new Queue('media-processing', { connection });

/**
 * Enqueue a media record for post-upload processing:
 * - images: generate Cloudinary thumbnail/variants
 * - videos: extract duration, optionally generate a poster frame
 * Keeps the upload request fast — the client gets a 202 immediately,
 * this runs in the worker process.
 */
async function enqueueMediaProcessing(mediaId) {
  await mediaQueue.add(
    'process-media',
    { mediaId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    }
  );
}

module.exports = { mediaQueue, connection, enqueueMediaProcessing };
