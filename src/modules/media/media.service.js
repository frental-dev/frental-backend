const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { minioClient, BUCKETS } = require("../../config/minio");
const { enqueueMediaProcessing } = require("../../jobs/mediaQueue");
const { ALLOWED_IMAGE_TYPES } = require("../../middleware/upload");

const prisma = new PrismaClient();

/**
 * Resolves the URL a client should actually load for a piece of media,
 * regardless of whether it ended up on Cloudinary or fell back to MinIO.
 * Presigned MinIO URLs are short-lived by design — call this at read time,
 * never store the result.
 */
async function resolveMediaUrl(media) {
  if (media.storageProvider === "CLOUDINARY" && media.cloudinaryUrl) {
    return { url: media.cloudinaryUrl, thumbnailUrl: media.thumbnailUrl };
  }
  // MINIO fallback (or videos, which always live in MinIO)
  const url = await minioClient.presignedGetObject(
    media.minioBucket,
    media.minioKey,
    60 * 60,
  ); // 1hr
  return { url, thumbnailUrl: null };
}

/**
 * Uploads a batch of files for a property:
 * 1. Verifies the property belongs to the requesting agent
 * 2. Streams each file buffer to MinIO
 * 3. Creates a Media row per file (status: PROCESSING)
 * 4. Enqueues background processing (thumbnailing, expiry)
 *
 * Returns immediately after MinIO writes — processing happens async.
 */
async function uploadPropertyMedia({ propertyId, agentId, files }) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agentId },
  });
  if (!property) {
    const err = new Error(
      "Property not found or does not belong to this agent",
    );
    err.statusCode = 404;
    throw err;
  }

  const existingCount = await prisma.media.count({ where: { propertyId } });

  const created = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const type = isImage ? "IMAGE" : "VIDEO";
    const ext = file.originalname.split(".").pop();
    const key = `properties/${propertyId}/${randomUUID()}.${ext}`;

    await minioClient.putObject(
      BUCKETS.PROPERTY_MEDIA,
      key,
      file.buffer,
      file.size,
      {
        "Content-Type": file.mimetype,
      },
    );

    const media = await prisma.media.create({
      data: {
        propertyId,
        type,
        status: "PROCESSING",
        minioBucket: BUCKETS.PROPERTY_MEDIA,
        minioKey: key,
        sizeBytes: file.size,
        sortOrder: existingCount + i,
      },
    });

    await enqueueMediaProcessing(media.id);
    created.push(media);
  }

  return created;
}

// async function listPropertyMedia(propertyId) {
//   const media = await prisma.media.findMany({
//     where: { propertyId, status: { not: 'DELETED' } },
//     orderBy: { sortOrder: 'asc' },
//   });

//   return Promise.all(
//     media.map(async (m) => {
//       const { url, thumbnailUrl } = await resolveMediaUrl(m);
//       return { ...m, url, thumbnailUrl: thumbnailUrl ?? m.thumbnailUrl };
//     })
//   );
// }
async function listPropertyMedia(propertyId, agentId) {
  // Verify that the property belongs to the requesting agent
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      agentId,
    },
    select: {
      id: true,
    },
  });

  if (!property) {
    const err = new Error(
      "Property not found or does not belong to this agent",
    );
    err.statusCode = 404;
    throw err;
  }

  const media = await prisma.media.findMany({
    where: {
      propertyId,
      status: { not: "DELETED" },
    },
    orderBy: { sortOrder: "asc" },
  });

  return Promise.all(
    media.map(async (m) => {
      const { url, thumbnailUrl } = await resolveMediaUrl(m);
      return {
        ...m,
        url,
        thumbnailUrl: thumbnailUrl ?? m.thumbnailUrl,
      };
    }),
  );
}

async function deleteMedia({ mediaId, agentId }) {
  const media = await prisma.media.findFirst({
    where: { id: mediaId, property: { agentId } },
  });
  if (!media) {
    const err = new Error("Media not found or does not belong to this agent");
    err.statusCode = 404;
    throw err;
  }

  await minioClient
    .removeObject(media.minioBucket, media.minioKey)
    .catch((e) =>
      console.error(
        `[media] failed to remove ${media.minioKey} from MinIO:`,
        e.message,
      ),
    );

  if (media.cloudinaryId) {
    const cloudinary = require("../../config/cloudinary");
    await cloudinary.uploader
      .destroy(media.cloudinaryId)
      .catch((e) =>
        console.error(
          `[media] failed to remove ${media.cloudinaryId} from Cloudinary:`,
          e.message,
        ),
      );
  }

  return prisma.media.update({
    where: { id: mediaId },
    data: { status: "DELETED" },
  });
}

module.exports = {
  uploadPropertyMedia,
  listPropertyMedia,
  deleteMedia,
  resolveMediaUrl,
};
