require("dotenv").config();
const { Worker } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { minioClient } = require("../config/minio");
const cloudinary = require("../config/cloudinary");
const { connection } = require("./mediaQueue");

const prisma = new PrismaClient();

// Media lifecycle: how long an ACTIVE media asset lives before it's eligible for archival.
const DEFAULT_EXPIRY_DAYS = 90;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Streams a MinIO object straight into Cloudinary — no public URL required,
 * so this works whether MinIO is on localhost, a private VPC, or anywhere else.
 */
function pushToCloudinary(objectStream, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    objectStream.on("error", reject);
    objectStream.pipe(uploadStream);
  });
}

async function processMedia(job) {
  const { mediaId } = job.data;

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  // Videos always stay in MinIO — never pushed through Cloudinary (cost).
  if (media.type === "VIDEO") {
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: "ACTIVE",
        storageProvider: "MINIO",
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      },
    });
    return;
  }

  // Images: try Cloudinary first (thumbnailing, optimized delivery).
  // Any Cloudinary failure — quota exceeded, rate limited, network error —
  // falls back to serving the original straight from MinIO instead of failing the job.
  try {
    const objectStream = await minioClient.getObject(
      media.minioBucket,
      media.minioKey,
    );

    const result = await pushToCloudinary(objectStream, {
      folder: `frental/property/${media.propertyId}`,
      transformation: [
        { width: 1600, crop: "limit", quality: "auto", fetch_format: "auto" },
      ],
    });

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        cloudinaryId: result.public_id,
        cloudinaryUrl: result.secure_url,
        thumbnailUrl: cloudinary.url(result.public_id, {
          width: 400,
          height: 300,
          crop: "fill",
          quality: "auto",
        }),
        storageProvider: "CLOUDINARY",
        status: "ACTIVE",
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      },
    });
  } catch (cloudErr) {
    console.warn(
      `[media-worker] Cloudinary unavailable for ${mediaId} (${cloudErr.message}) — falling back to MinIO`,
    );

    // Fallback: no Cloudinary transform/thumbnail, but the file is still usable —
    // consumers should build a URL from minioBucket/minioKey (or a presigned GET) when
    // cloudinaryUrl is null and storageProvider is MINIO.
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        storageProvider: "MINIO",
        status: "ACTIVE",
        expiresAt: addDays(new Date(), DEFAULT_EXPIRY_DAYS),
      },
    });
  }
}

const worker = new Worker("media-processing", processMedia, {
  connection,
  concurrency: 5,
});

// worker.on("failed", (job, err) => {
//   // Only genuine infra failures (DB down, MinIO unreachable) land here now —
//   // Cloudinary failures are handled gracefully above and never throw.
//   console.error(
//     `[media-worker] job ${job.id} failed after retries:`,
//     err.message,
//   );
// });
worker.on("ready", () => {
  console.log("[media-worker] Worker ready — waiting for jobs...");
});

worker.on("completed", (job) => {
  console.log(`[media-worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[media-worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[media-worker] Worker error:", err);
});

module.exports = worker;
