/**
 * Seed script — populates the database with realistic sample data so you can
 * test every module (Agents, Properties, Clients, Viewings, Marketplace, Leads)
 * without manually creating records via Postman first.
 *
 * Run: npm run seed
 * Safe to re-run: it wipes existing data in dependency order before reseeding.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'password123'; // same password for every seeded agent, for easy testing

async function main() {
  console.log('Clearing existing data...');
  await prisma.lead.deleteMany();
  await prisma.viewing.deleteMany();
  await prisma.media.deleteMany();
  await prisma.client.deleteMany();
  await prisma.property.deleteMany();
  await prisma.agent.deleteMany();

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  console.log('Creating agents...');
  const [victor, aisha] = await Promise.all([
    prisma.agent.create({
      data: {
        name: 'Victor Kamau',
        phone: '0700111222',
        whatsapp: '0700111222',
        email: 'victor@frental.test',
        passwordHash,
        publicSlug: 'victor-kamau',
        bio: 'House-hunting agent covering Kilimani and Lavington.',
        subscriptionTier: 'PRO',
        isVerified: true,
      },
    }),
    prisma.agent.create({
      data: {
        name: 'Aisha Noor',
        phone: '0700333444',
        whatsapp: '0700333444',
        email: 'aisha@frental.test',
        passwordHash,
        publicSlug: 'aisha-noor',
        bio: 'Specialist in bedsitters and one-bedrooms around Kasarani.',
        subscriptionTier: 'FREE',
        isVerified: false,
      },
    }),
  ]);

  console.log('Creating properties...');
  const properties = await Promise.all([
    prisma.property.create({
      data: {
        agentId: victor.id,
        title: 'Modern 2BR Apartment',
        description: 'Bright 2-bedroom unit with balcony, close to Yaya Centre.',
        rent: 45000,
        deposit: 45000,
        houseType: 'TWO_BEDROOM',
        estate: 'Kilimani',
        city: 'Nairobi',
        features: ['parking', 'borehole water', 'gym'],
        approxLat: -1.2921,
        approxLng: 36.7833,
        status: 'AVAILABLE',
      },
    }),
    prisma.property.create({
      data: {
        agentId: victor.id,
        title: 'Spacious 3BR Maisonette',
        description: 'Gated community, 24hr security, DSQ included.',
        rent: 90000,
        deposit: 180000,
        houseType: 'MAISONETTE',
        estate: 'Lavington',
        city: 'Nairobi',
        features: ['dsq', 'garden', 'cctv'],
        approxLat: -1.2794,
        approxLng: 36.7687,
        status: 'AVAILABLE',
      },
    }),
    prisma.property.create({
      data: {
        agentId: victor.id,
        title: 'Cozy Bedsitter',
        rent: 12000,
        deposit: 12000,
        houseType: 'BEDSITTER',
        estate: 'Kilimani',
        city: 'Nairobi',
        features: ['water included'],
        status: 'TAKEN',
      },
    }),
    prisma.property.create({
      data: {
        agentId: aisha.id,
        title: 'Affordable 1BR near Thika Road',
        rent: 18000,
        deposit: 18000,
        houseType: 'ONE_BEDROOM',
        estate: 'Kasarani',
        city: 'Nairobi',
        features: ['parking', 'tiled floors'],
        status: 'AVAILABLE',
      },
    }),
    prisma.property.create({
      data: {
        agentId: aisha.id,
        title: 'Bedsitter with Balcony',
        rent: 10000,
        deposit: 10000,
        houseType: 'BEDSITTER',
        estate: 'Kasarani',
        city: 'Nairobi',
        features: [],
        status: 'HOLD',
      },
    }),
  ]);

  console.log('Creating clients...');
  const [johnClient, , samClient] = await Promise.all([
    prisma.client.create({
      data: {
        agentId: victor.id,
        name: 'John Mwangi',
        phone: '0711000111',
        budgetMin: 35000,
        budgetMax: 50000,
        houseType: 'TWO_BEDROOM',
        preferredEstate: 'Kilimani',
        status: 'VIEWING_SCHEDULED',
        notes: 'Prefers ground floor units.',
      },
    }),
    prisma.client.create({
      data: {
        agentId: victor.id,
        name: 'Mary Wambui',
        phone: '0711000222',
        budgetMin: 80000,
        budgetMax: 100000,
        houseType: 'MAISONETTE',
        preferredEstate: 'Lavington',
        status: 'NEW',
      },
    }),
    prisma.client.create({
      data: {
        agentId: aisha.id,
        name: 'Sam Otieno',
        phone: '0711000333',
        budgetMin: 15000,
        budgetMax: 20000,
        houseType: 'ONE_BEDROOM',
        preferredEstate: 'Kasarani',
        status: 'CLOSED',
      },
    }),
  ]);

  console.log('Creating viewings...');
  await Promise.all([
    prisma.viewing.create({
      data: {
        agentId: victor.id,
        clientId: johnClient.id,
        propertyId: properties[0].id,
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'SCHEDULED',
        notes: 'Meeting at the gate at 2pm.',
      },
    }),
    prisma.viewing.create({
      data: {
        agentId: aisha.id,
        clientId: samClient.id,
        propertyId: properties[3].id,
        scheduledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: 'COMPLETED',
        notes: 'Client loved it — proceeded to close.',
      },
    }),
  ]);

  console.log('Creating leads...');
  await Promise.all([
    prisma.lead.create({
      data: {
        agentId: victor.id,
        propertyId: properties[1].id,
        source: 'WHATSAPP',
        status: 'NEW',
        name: 'Peter Njoroge',
        phone: '0722000111',
        message: 'Is the Lavington maisonette still available?',
      },
    }),
    prisma.lead.create({
      data: {
        agentId: victor.id,
        propertyId: properties[0].id,
        source: 'MARKETPLACE',
        status: 'CONTACTED',
        name: 'Grace Achieng',
        phone: '0722000222',
        message: 'Interested, can I view this weekend?',
      },
    }),
    prisma.lead.create({
      data: {
        agentId: aisha.id,
        propertyId: properties[3].id,
        source: 'TIKTOK',
        status: 'NEW',
        name: 'Kevin Otieno',
        phone: '0722000333',
        message: 'Saw your video, is it still there?',
      },
    }),
  ]);

  console.log('\nSeed complete.\n');
  console.log(`Test agents (all use password: ${SEED_PASSWORD})`);
  console.log(`  ${victor.name} — phone: ${victor.phone} — public page: GET /api/agents/public/${victor.publicSlug}`);
  console.log(`  ${aisha.name} — phone: ${aisha.phone} — public page: GET /api/agents/public/${aisha.publicSlug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
