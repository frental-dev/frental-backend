const { Client } = require('minio');

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKETS = {
  PROPERTY_MEDIA: process.env.MINIO_BUCKET || 'frental-media',
};

// Ensures required buckets exist. Call once on server boot.
async function ensureBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    const exists = await minioClient.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await minioClient.makeBucket(bucket, process.env.MINIO_REGION || 'us-east-1');
      console.log(`[minio] created bucket: ${bucket}`);
    }
  }
}

module.exports = { minioClient, BUCKETS, ensureBuckets };
