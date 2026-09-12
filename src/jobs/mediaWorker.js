const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { minioClient } = require('../config/minio');
const cloudinary = require('../config/cloudinary');
const { connection } = require('./mediaQueue');

const prisma = new PrismaClient();

const DEFAULT_EXPIRY_DAYS = 90;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function pushToCloudinary(objectStream, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    objectStream.on('error', reject);
    objectStream.pipe(uploadStream);
  });
}

async function processMedia(job) {
  const { mediaId } = job.data;

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  if (media.type === 'VIDEO') {
    await prisma.media.update({
      where: { id: mediaId },
      data: { status: 'ACTIVE', storageProvider: 'MINIO', expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS) },
    });
    return;
  }

  try {
    const objectStream = await minioClient.getObject(media.minioBucket, media.minioKey);

    const result = await pushToCloudinary(objectStream, {
      folder: `frental/property/${media.propertyId}`,
      transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    });

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        cloudinaryId: result.public_id,
        cloudinaryUrl: result.secure_url,
        thumbnailUrl: cloudinary.url(result.public_id, { width: 400, height: 300, crop: 'fill', quality: 'auto' }),
        storageProvider: 'CLOUDINARY',
        status: 'ACTIVE',
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      },
    });
  } catch (cloudErr) {
    console.warn(`[media-worker] Cloudinary unavailable for ${mediaId} (${cloudErr.message}) — falling back to MinIO`);
    await prisma.media.update({
      where: { id: mediaId },
      data: { storageProvider: 'MINIO', status: 'ACTIVE', expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS) },
    });
  }
}

const worker = new Worker('media-processing', processMedia, { connection, concurrency: 5 });

worker.on('failed', (job, err) => {
  console.error(`[media-worker] job ${job.id} failed after retries:`, err.message);
});

module.exports = worker;
