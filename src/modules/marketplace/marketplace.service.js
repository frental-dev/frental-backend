const { PrismaClient } = require('@prisma/client');
const { resolveMediaUrl } = require('../media/media.service');

const prisma = new PrismaClient();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Strips exact location + anything else agents shouldn't leak publicly.
// Exact address only gets revealed once a Viewing is CONFIRMED for that client (handled in Viewings module).
// Also resolves each media item's display URL — Cloudinary when available, a fresh
// presigned MinIO URL when a file fell back — so the public API never leaks raw
// storage keys or a stale/empty cloudinaryUrl.
async function toPublicProperty(property) {
  const { exactLat, exactLng, exactAddress, media, ...safe } = property;

  const resolvedMedia = await Promise.all(
    media.map(async (m) => {
      const { url, thumbnailUrl } = await resolveMediaUrl(m);
      return { id: m.id, type: m.type, sortOrder: m.sortOrder, url, thumbnailUrl: thumbnailUrl ?? m.thumbnailUrl };
    })
  );

  return { ...safe, media: resolvedMedia };
}

/**
 * Public marketplace search. Only ever returns AVAILABLE properties.
 * Supports filtering by estate, city, houseType, and rent range, plus pagination.
 */
async function searchProperties(query) {
  const {
    estate,
    city,
    houseType,
    minRent,
    maxRent,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = query;

  const take = Math.min(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const where = {
    status: 'AVAILABLE',
    ...(estate ? { estate: { equals: estate, mode: 'insensitive' } } : {}),
    ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
    ...(houseType ? { houseType } : {}),
    ...(minRent || maxRent
      ? {
          rent: {
            ...(minRent ? { gte: parseInt(minRent, 10) } : {}),
            ...(maxRent ? { lte: parseInt(maxRent, 10) } : {}),
          },
        }
      : {}),
  };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, take: 5 },
        agent: { select: { name: true, publicSlug: true, whatsapp: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.property.count({ where }),
  ]);

  const results = await Promise.all(properties.map(toPublicProperty));

  return {
    results,
    pagination: {
      page: Math.max(parseInt(page, 10) || 1, 1),
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

/**
 * Single public property detail page.
 * Only returns the property if it's currently AVAILABLE — taken/hold listings
 * 404 on the public side even though they still exist for the owning agent.
 */
async function getPublicProperty(propertyId) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, status: 'AVAILABLE' },
    include: {
      media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } },
      agent: { select: { name: true, publicSlug: true, whatsapp: true, isVerified: true } },
    },
  });

  if (!property) {
    const err = new Error('Property not found or no longer available');
    err.statusCode = 404;
    throw err;
  }

  return toPublicProperty(property);
}

module.exports = { searchProperties, getPublicProperty };
