const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '30d';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function generateUniqueSlug(name) {
  const base = slugify(name) || 'agent';
  let slug = base;
  let suffix = 1;

  while (await prisma.agent.findUnique({ where: { publicSlug: slug } })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

function issueToken(agent) {
  return jwt.sign({ sub: agent.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function toPublicAgent(agent) {
  const { passwordHash, ...safe } = agent;
  return safe;
}

async function signup({ name, phone, whatsapp, email, password }) {
  const existing = await prisma.agent.findUnique({ where: { phone } });
  if (existing) {
    const err = new Error('An account with this phone number already exists');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const publicSlug = await generateUniqueSlug(name);

  const agent = await prisma.agent.create({
    data: { name, phone, whatsapp, email, passwordHash, publicSlug },
  });

  return { agent: toPublicAgent(agent), token: issueToken(agent) };
}

async function login({ phone, password }) {
  const agent = await prisma.agent.findUnique({ where: { phone } });
  if (!agent) {
    const err = new Error('Invalid phone number or password');
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, agent.passwordHash);
  if (!valid) {
    const err = new Error('Invalid phone number or password');
    err.statusCode = 401;
    throw err;
  }

  return { agent: toPublicAgent(agent), token: issueToken(agent) };
}

async function getById(agentId) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  return toPublicAgent(agent);
}

async function getPublicBySlug(publicSlug) {
  const agent = await prisma.agent.findUnique({
    where: { publicSlug },
    include: {
      properties: {
        where: { status: 'AVAILABLE' },
        include: { media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!agent) {
    const err = new Error('Agent not found');
    err.statusCode = 404;
    throw err;
  }
  return toPublicAgent(agent);
}

async function updateProfile(agentId, updates) {
  const allowed = ['name', 'whatsapp', 'email', 'bio', 'avatarUrl'];
  const data = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) data[key] = updates[key];
  }

  const agent = await prisma.agent.update({ where: { id: agentId }, data });
  return toPublicAgent(agent);
}

async function changePassword(agentId, { currentPassword, newPassword }) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  const valid = await bcrypt.compare(currentPassword, agent.passwordHash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.agent.update({ where: { id: agentId }, data: { passwordHash } });
  return { success: true };
}

module.exports = {
  signup,
  login,
  getById,
  getPublicBySlug,
  updateProfile,
  changePassword,
};
