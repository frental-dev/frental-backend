const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CREATE_FIELDS = ['name', 'phone', 'budgetMin', 'budgetMax', 'houseType', 'preferredEstate', 'notes'];
const UPDATE_FIELDS = [...CREATE_FIELDS, 'status'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) { if (source[key] !== undefined) out[key] = source[key]; }
  return out;
}

async function createClient(agentId, input) {
  const data = pick(input, CREATE_FIELDS);
  if (!data.name || !data.phone) {
    const err = new Error('name and phone are required');
    err.statusCode = 400;
    throw err;
  }
  return prisma.client.create({ data: { ...data, agentId } });
}

async function getClient(clientId, agentId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, agentId },
    include: { viewings: { include: { property: { select: { id: true, title: true, estate: true } } }, orderBy: { scheduledAt: 'desc' } } },
  });
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  return client;
}

async function listClients(agentId, { status, search } = {}) {
  return prisma.client.findMany({
    where: {
      agentId,
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });
}

async function updateClient(clientId, agentId, input) {
  const existing = await prisma.client.findFirst({ where: { id: clientId, agentId } });
  if (!existing) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  const data = pick(input, UPDATE_FIELDS);
  return prisma.client.update({ where: { id: clientId }, data });
}

async function deleteClient(clientId, agentId) {
  const existing = await prisma.client.findFirst({ where: { id: clientId, agentId } });
  if (!existing) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.client.delete({ where: { id: clientId } });
  return { success: true };
}

module.exports = { createClient, getClient, listClients, updateClient, deleteClient };
