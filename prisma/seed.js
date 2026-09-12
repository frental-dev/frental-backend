/**
 * Seeds the database with demo data so you can test every module without
 * manually creating records first. Wipes and recreates on every run — safe
 * to re-run.
 *
 * Run: npm run seed
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'password123';

async function main() {
  console.log('Clearing existing data...');
  await prisma.lead.deleteMany();
  await prisma.viewing.deleteMany();
  await prisma.media.deleteMany();
  await prisma.client.deleteMany();
  await prisma.property.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authEvent.deleteMany();
  await prisma.agent.deleteMany();

  console.log('Seeding Frental demo data...\n');

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const victor = await prisma.agent.create({
    data: {
      name: 'Victor Kamau',
      phone: '0700111222',
      whatsapp: '0700111222',
      email: 'victor@frental.test',
      emailVerified: true,
      passwordHash,
      publicSlug: 'victor-kamau',
      bio: 'House-hunting agent covering Kilimani and Lavington.',
      isVerified: true,
    },
  });

  const aisha = await prisma.agent.create({
    data: {
      name: 'Aisha Noor',
      phone: '0700333444',
      whatsapp: '0700333444',
      email: 'aisha@frental.test',
      emailVerified: true,
      passwordHash,
      publicSlug: 'aisha-noor',
      bio: 'Specializing in Ruaka and Kasarani listings.',
      isVerified: false,
    },
  });

  const properties = [];
  for (const data of [
    {
      agentId: victor.id,
      title: 'Modern 2BR in Kilimani',
      description: 'Bright, recently renovated unit with a balcony overlooking the estate.',
      rent: 45000,
      deposit: 45000,
      houseType: 'TWO_BEDROOM',
      bedrooms: 2,
      bathrooms: 2,
      estate: 'Kilimani',
      features: ['parking', 'borehole', 'gym'],
    },
    {
      agentId: victor.id,
      title: 'Cozy Bedsitter near Yaya Centre',
      rent: 18000,
      deposit: 18000,
      houseType: 'BEDSITTER',
      bedrooms: 0,
      bathrooms: 1,
      estate: 'Kilimani',
      features: ['wifi'],
    },
    {
      agentId: victor.id,
      title: 'Spacious 3BR Maisonette Lavington',
      rent: 90000,
      deposit: 90000,
      houseType: 'MAISONETTE',
      bedrooms: 3,
      bathrooms: 3,
      estate: 'Lavington',
      features: ['garden', 'parking', 'dsq'],
      status: 'TAKEN',
    },
    {
      agentId: aisha.id,
      title: '1BR Apartment in Ruaka',
      rent: 22000,
      deposit: 22000,
      houseType: 'ONE_BEDROOM',
      bedrooms: 1,
      bathrooms: 1,
      estate: 'Ruaka',
      features: ['parking'],
    },
    {
      agentId: aisha.id,
      title: 'Bungalow in Kasarani',
      rent: 35000,
      deposit: 35000,
      houseType: 'BUNGALOW',
      bedrooms: 3,
      bathrooms: 2,
      estate: 'Kasarani',
      features: ['compound', 'parking'],
    },
  ]) {
    properties.push(await prisma.property.create({ data }));
  }

  const clients = [];
  for (const data of [
    {
      agentId: victor.id,
      name: 'Brian Mwangi',
      phone: '0733333333',
      budgetMin: 30000,
      budgetMax: 50000,
      houseType: 'TWO_BEDROOM',
      preferredEstate: 'Kilimani',
    },
    {
      agentId: victor.id,
      name: 'Faith Njeri',
      phone: '0744444444',
      budgetMin: 15000,
      budgetMax: 20000,
      houseType: 'BEDSITTER',
      preferredEstate: 'Kilimani',
    },
    {
      agentId: aisha.id,
      name: 'Dennis Kiptoo',
      phone: '0755555555',
      budgetMin: 20000,
      budgetMax: 25000,
      houseType: 'ONE_BEDROOM',
      preferredEstate: 'Ruaka',
    },
  ]) {
    clients.push(await prisma.client.create({ data }));
  }

  await prisma.viewing.create({
    data: {
      agentId: victor.id,
      clientId: clients[0].id,
      propertyId: properties[0].id,
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: 'SCHEDULED',
      notes: 'Client wants to check the kitchen and water pressure.',
    },
  });
  await prisma.viewing.create({
    data: {
      agentId: aisha.id,
      clientId: clients[2].id,
      propertyId: properties[3].id,
      scheduledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status: 'COMPLETED',
      notes: 'Went well, client is considering it.',
    },
  });

  await prisma.client.update({
    where: { id: clients[0].id },
    data: { status: 'VIEWING_SCHEDULED' },
  });

  await prisma.lead.createMany({
    data: [
      {
        agentId: victor.id,
        propertyId: properties[0].id,
        source: 'WHATSAPP',
        name: 'Interested Person',
        phone: '0766666666',
        message: 'Is this still available?',
      },
      {
        agentId: victor.id,
        propertyId: properties[1].id,
        source: 'MARKETPLACE',
        name: 'Anonymous Browser',
        message: 'Can I get more photos?',
      },
      {
        agentId: aisha.id,
        propertyId: properties[3].id,
        source: 'TIKTOK',
        name: 'TikTok Viewer',
        phone: '0777777777',
      },
    ],
  });

  console.log('Seed complete.\n');
  console.log('Demo agent logins (POST /api/agents/login, phone OR email):');
  console.log(`  phone=${victor.phone} / email=${victor.email}  password=${SEED_PASSWORD}  (${victor.name}, slug: ${victor.publicSlug})`);
  console.log(`  phone=${aisha.phone} / email=${aisha.email}  password=${SEED_PASSWORD}  (${aisha.name}, slug: ${aisha.publicSlug})`);
  console.log('\nNote: no Media records were seeded — upload real files via Postman to test that pipeline.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
