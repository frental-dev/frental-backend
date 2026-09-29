const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CREATE_FIELDS = [
  'title', 'description', 'rent', 'deposit', 'houseType',
  'bedrooms', 'bathrooms', 'estate', 'city', 'features', 'approxLat', 'approxLng',
];
const UPDATE_FIELDS = [...CREATE_FIELDS, 'exactLat', 'exactLng', 'exactAddress'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

async function createProperty(agentId, input) {
  const data = pick(input, CREATE_FIELDS);
  if (!data.title || !data.rent || !data.deposit || !data.houseType || !data.estate) {
    const err = new Error('title, rent, deposit, houseType, and estate are required');
    err.statusCode = 400;
    throw err;
  }
  return prisma.property.create({ data: { ...data, agentId } });
}

async function getProperty(propertyId, { agentId } = {}) {
  const where = agentId ? { id: propertyId, agentId } : { id: propertyId };
  const property = await prisma.property.findFirst({
    where,
    include: { media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!property) {
    const err = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  return property;
}

async function listAgentProperties(agentId, { status } = {}) {
  return prisma.property.findMany({
    where: { agentId, ...(status ? { status } : {}) },
    include: { media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  });
}

async function updateProperty(propertyId, agentId, input) {
  const existing = await prisma.property.findFirst({ where: { id: propertyId, agentId } });
  if (!existing) {
    const err = new Error('Property not found or does not belong to this agent');
    err.statusCode = 404;
    throw err;
  }
  const data = pick(input, UPDATE_FIELDS);
  return prisma.property.update({ where: { id: propertyId }, data });
}

async function setStatus(propertyId, agentId, status) {
  const valid = ['AVAILABLE', 'TAKEN', 'HOLD'];
  if (!valid.includes(status)) {
    const err = new Error(`status must be one of: ${valid.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const existing = await prisma.property.findFirst({ where: { id: propertyId, agentId } });
  if (!existing) {
    const err = new Error('Property not found or does not belong to this agent');
    err.statusCode = 404;
    throw err;
  }
  return prisma.property.update({ where: { id: propertyId }, data: { status } });
}

async function deleteProperty(propertyId, agentId) {
  const existing = await prisma.property.findFirst({ where: { id: propertyId, agentId } });
  if (!existing) {
    const err = new Error('Property not found or does not belong to this agent');
    err.statusCode = 404;
    throw err;
  }
  await prisma.property.delete({ where: { id: propertyId } });
  return { success: true };
}

/**
 * Case-insensitive partial match on title/estate/city, scoped to the
 * agent's own properties (any status — this is an internal search tool
 * for the agent, not the public marketplace, so TAKEN/HOLD listings are
 * still findable). Powers the Android app's property search screen.
 */
async function searchAgentProperties(agentId, query) {
  if (!query || !query.trim()) {
    const err = new Error('query parameter is required');
    err.statusCode = 400;
    throw err;
  }

  return prisma.property.findMany({
    where: {
      agentId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { estate: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true, estate: true, city: true, rent: true },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  createProperty,
  getProperty,
  listAgentProperties,
  updateProperty,
  setStatus,
  deleteProperty,
  searchAgentProperties,
};
