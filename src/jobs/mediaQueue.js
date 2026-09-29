const IORedis = require('ioredis');
const { Queue } = require('bullmq');

const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null,
    });

const QUEUE_PREFIX = process.env.QUEUE_PREFIX || 'frental-local';

const mediaQueue = new Queue('media-processing', {
  connection,
  prefix: QUEUE_PREFIX,
});

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

module.exports = {
  mediaQueue,
  connection,
  enqueueMediaProcessing,
  QUEUE_PREFIX,
};