const { PrismaClient } = require('@prisma/client');
const { sendNotificationToAgent } = require('../../services/notificationService');
const prisma = new PrismaClient();

const VALID_SOURCES = ['WHATSAPP', 'MARKETPLACE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'DIRECT'];
const UPDATE_FIELDS = ['status', 'name', 'phone', 'message'];

function pick(source, keys) {
  const out = {};
  for (const key of keys) { if (source[key] !== undefined) out[key] = source[key]; }
  return out;
}

async function createPublicLead({ propertyId, source, name, phone, message }) {
  if (!propertyId || !VALID_SOURCES.includes(source)) {
    const err = new Error(`propertyId is required and source must be one of: ${VALID_SOURCES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    const err = new Error('Property not found');
    err.statusCode = 404;
    throw err;
  }
  const lead = await prisma.lead.create({
    data: { agentId: property.agentId, propertyId, source, name, phone, message },
  });

  // Fire-and-forget — a push failing should never slow down or break lead
  // creation. sendNotificationToAgent already catches its own errors.
  sendNotificationToAgent(property.agentId, {
    title: 'New Lead Received',
    body: `${name || 'A prospective client'} is interested in ${property.title}`,
    type: 'NEW_LEAD',
    entityId: lead.id,
    entityType: 'LEAD',
    clickAction: `frental://leads/${lead.id}`,
  });

  return lead;
}

async function createManualLead(agentId, input) {
  const { propertyId, source, name, phone, message } = input;
  if (!VALID_SOURCES.includes(source)) {
    const err = new Error(`source must be one of: ${VALID_SOURCES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  let property = null;
  if (propertyId) {
    property = await prisma.property.findFirst({ where: { id: propertyId, agentId } });
    if (!property) {
      const err = new Error('Property not found or does not belong to this agent');
      err.statusCode = 404;
      throw err;
    }
  }

  const lead = await prisma.lead.create({ data: { agentId, propertyId, source, name, phone, message } });

  // Lower-value than the public-form trigger (the agent is the one logging
  // this, so it's not "news" to them) — still useful for cross-device sync,
  // e.g. logged on a tablet, pushed to the phone they're carrying.
  sendNotificationToAgent(agentId, {
    title: 'New Lead Logged',
    body: property ? `${name || 'A lead'} — interested in ${property.title}` : `${name || 'A new lead'} was logged`,
    type: 'NEW_LEAD',
    entityId: lead.id,
    entityType: 'LEAD',
    clickAction: `frental://leads/${lead.id}`,
  });

  return lead;
}

async function listLeads(agentId, { status, source } = {}) {
  return prisma.lead.findMany({
    where: { agentId, ...(status ? { status } : {}), ...(source ? { source } : {}) },
    include: { property: { select: { id: true, title: true, estate: true } }, client: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function getLead(leadId, agentId) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, agentId },
    include: { property: { select: { id: true, title: true, estate: true } }, client: true },
  });
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }
  return lead;
}

async function updateLead(leadId, agentId, input) {
  const existing = await prisma.lead.findFirst({ where: { id: leadId, agentId } });
  if (!existing) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }
  const data = pick(input, UPDATE_FIELDS);
  return prisma.lead.update({ where: { id: leadId }, data });
}

async function convertToClient(leadId, agentId, clientInput) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, agentId } });
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }
  const name = clientInput.name || lead.name;
  const phone = clientInput.phone || lead.phone;
  if (!name || !phone) {
    const err = new Error('name and phone are required to convert a lead into a client');
    err.statusCode = 400;
    throw err;
  }
  const client = await prisma.client.create({
    data: {
      agentId, name, phone,
      budgetMin: clientInput.budgetMin, budgetMax: clientInput.budgetMax,
      houseType: clientInput.houseType, preferredEstate: clientInput.preferredEstate,
      notes: clientInput.notes,
    },
  });
  const updatedLead = await prisma.lead.update({ where: { id: leadId }, data: { status: 'CONVERTED', clientId: client.id } });
  return { client, lead: updatedLead };
}

async function deleteLead(leadId, agentId) {
  const existing = await prisma.lead.findFirst({ where: { id: leadId, agentId } });
  if (!existing) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }
  await prisma.lead.delete({ where: { id: leadId } });
  return { success: true };
}

module.exports = { createPublicLead, createManualLead, listLeads, getLead, updateLead, convertToClient, deleteLead };
