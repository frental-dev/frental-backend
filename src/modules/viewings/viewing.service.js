const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const UPDATE_FIELDS = ['scheduledAt', 'notes'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

async function assertOwnership(agentId, { clientId, propertyId }) {
  const [client, property] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, agentId } }),
    prisma.property.findFirst({ where: { id: propertyId, agentId } }),
  ]);

  if (!client) {
    const err = new Error('Client not found or does not belong to this agent');
    err.statusCode = 404;
    throw err;
  }
  if (!property) {
    const err = new Error('Property not found or does not belong to this agent');
    err.statusCode = 404;
    throw err;
  }
}

async function createViewing(agentId, input) {
  const { clientId, propertyId, scheduledAt, notes } = input;

  if (!clientId || !propertyId || !scheduledAt) {
    const err = new Error('clientId, propertyId, and scheduledAt are required');
    err.statusCode = 400;
    throw err;
  }

  await assertOwnership(agentId, { clientId, propertyId });

  const viewing = await prisma.viewing.create({
    data: { agentId, clientId, propertyId, scheduledAt: new Date(scheduledAt), notes },
  });

  // Move the client along the pipeline automatically — only if they haven't progressed further already.
  await prisma.client.updateMany({
    where: { id: clientId, status: 'NEW' },
    data: { status: 'VIEWING_SCHEDULED' },
  });

  return viewing;
}

async function getViewing(viewingId, agentId) {
  const viewing = await prisma.viewing.findFirst({
    where: { id: viewingId, agentId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, estate: true, rent: true } },
    },
  });
  if (!viewing) {
    const err = new Error('Viewing not found');
    err.statusCode = 404;
    throw err;
  }
  return viewing;
}

// Agent's schedule — filterable by status and date range, useful for "today's viewings"
async function listViewings(agentId, { status, from, to } = {}) {
  return prisma.viewing.findMany({
    where: {
      agentId,
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, estate: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

async function updateViewing(viewingId, agentId, input) {
  const existing = await prisma.viewing.findFirst({ where: { id: viewingId, agentId } });
  if (!existing) {
    const err = new Error('Viewing not found');
    err.statusCode = 404;
    throw err;
  }

  const data = pick(input, UPDATE_FIELDS);
  if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);

  return prisma.viewing.update({ where: { id: viewingId }, data });
}

async function setStatus(viewingId, agentId, status) {
  const valid = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
  if (!valid.includes(status)) {
    const err = new Error(`status must be one of: ${valid.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.viewing.findFirst({ where: { id: viewingId, agentId } });
  if (!existing) {
    const err = new Error('Viewing not found');
    err.statusCode = 404;
    throw err;
  }

  return prisma.viewing.update({ where: { id: viewingId }, data: { status } });
}

async function deleteViewing(viewingId, agentId) {
  const existing = await prisma.viewing.findFirst({ where: { id: viewingId, agentId } });
  if (!existing) {
    const err = new Error('Viewing not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.viewing.delete({ where: { id: viewingId } });
  return { success: true };
}

module.exports = { createViewing, getViewing, listViewings, updateViewing, setStatus, deleteViewing };
