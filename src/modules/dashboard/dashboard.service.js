const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RECENT_PROPERTIES_LIMIT = 5;
const ACTIVITY_DAYS = 7;

function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function endOfDay(date) { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }
function dateKey(date) { return new Date(date).toISOString().split('T')[0]; }

function formatNairobiTime(date) {
  return new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }).format(new Date(date));
}

function groupCountsByDay(records, dateField, days) {
  const counts = {};
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    counts[dateKey(d)] = 0;
  }
  for (const record of records) {
    const key = dateKey(record[dateField]);
    if (key in counts) counts[key]++;
  }
  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

async function getDashboard(agentId) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const activitySince = new Date(todayStart);
  activitySince.setDate(activitySince.getDate() - (ACTIVITY_DAYS - 1));

  const [
    totalProperties, totalClients, todaysViewingsCount, newLeadsCount,
    recentProperties, todaysViewings, propertiesForActivity, viewingsForActivity,
  ] = await Promise.all([
    prisma.property.count({ where: { agentId } }),
    prisma.client.count({ where: { agentId } }),
    prisma.viewing.count({ where: { agentId, scheduledAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.lead.count({ where: { agentId, status: 'NEW' } }),
    prisma.property.findMany({
      where: { agentId }, orderBy: { createdAt: 'desc' }, take: RECENT_PROPERTIES_LIMIT,
      include: { media: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    }),
    prisma.viewing.findMany({
      where: { agentId, scheduledAt: { gte: todayStart, lte: todayEnd } }, orderBy: { scheduledAt: 'asc' },
      include: {
        client: { select: { id: true, name: true } },
        property: { select: { id: true, title: true, estate: true } },
      },
    }),
    prisma.property.findMany({ where: { agentId, createdAt: { gte: activitySince } }, select: { createdAt: true } }),
    prisma.viewing.findMany({ where: { agentId, createdAt: { gte: activitySince } }, select: { createdAt: true } }),
  ]);

  return {
    summary: { totalProperties, totalClients, todaysViewings: todaysViewingsCount, newLeads: newLeadsCount },
    recentProperties: recentProperties.map((p) => ({
      id: p.id, title: p.title, rent: p.rent, estate: p.estate, city: p.city, status: p.status,
      thumbnail: p.media[0]?.thumbnailUrl || p.media[0]?.url || null,
    })),
    todaysViewings: todaysViewings.map((v) => ({
      id: v.id, time: formatNairobiTime(v.scheduledAt), scheduledAt: v.scheduledAt,
      client: v.client, property: v.property, status: v.status,
    })),
    activity: {
      properties: groupCountsByDay(propertiesForActivity, 'createdAt', ACTIVITY_DAYS),
      viewings: groupCountsByDay(viewingsForActivity, 'createdAt', ACTIVITY_DAYS),
    },
  };
}

module.exports = { getDashboard };
