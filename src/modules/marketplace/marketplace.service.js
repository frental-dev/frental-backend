const { PrismaClient } = require('@prisma/client');
const { resolveMediaUrl } = require('../media/media.service');

const prisma = new PrismaClient();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

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

async function searchProperties(query) {
  const {
    estate, city, houseType, minRent, maxRent, minBedrooms, minBathrooms,
    page = 1, pageSize = DEFAULT_PAGE_SIZE,
  } = query;

  const take = Math.min(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const where = {
    status: 'AVAILABLE',
    ...(estate ? { estate: { equals: estate, mode: 'insensitive' } } : {}),
    ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
    ...(houseType ? { houseType } : {}),
    ...(minRent || maxRent ? { rent: { ...(minRent ? { gte: parseInt(minRent, 10) } : {}), ...(maxRent ? { lte: parseInt(maxRent, 10) } : {}) } } : {}),
    // "At least N" rather than exact match — a client wanting 2 bedrooms is
    // usually fine with 3. Also the field this project's future matching
    // engine's "bedrooms match" scoring will build on.
    ...(minBedrooms ? { bedrooms: { gte: parseInt(minBedrooms, 10) } } : {}),
    ...(minBathrooms ? { bathrooms: { gte: parseInt(minBathrooms, 10) } } : {}),
  };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, take: 5 },
        agent: { select: { name: true, publicSlug: true, whatsapp: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take, skip,
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
