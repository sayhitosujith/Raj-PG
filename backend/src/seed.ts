import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const properties = [
  { name: 'The Fern House', location: 'Koramangala, Bengaluru', imageUrl: 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80', status: 'Healthy', rooms: 50, occupied: 46 },
  { name: 'North Star Living', location: 'Hitech City, Hyderabad', imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80', status: 'Watch', rooms: 40, occupied: 31 },
  { name: 'Casa 21', location: 'Indiranagar, Bengaluru', imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80', status: 'Healthy', rooms: 25, occupied: 24 },
]

async function seed() {
  await prisma.activity.deleteMany()
  await prisma.maintenanceRequest.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.resident.deleteMany()
  await prisma.room.deleteMany()
  await prisma.property.deleteMany()

  const created: Array<{ id: string; name: string }> = []
  for (const property of properties) {
    const record = await prisma.property.create({ data: { name: property.name, location: property.location, imageUrl: property.imageUrl, status: property.status } })
    const rooms = await Promise.all(Array.from({ length: property.rooms }, (_, index) => prisma.room.create({ data: { number: String(index + 101), propertyId: record.id } })))
    await Promise.all(rooms.slice(0, property.occupied).map((room, index) => prisma.resident.create({ data: { name: `Resident ${index + 1}`, roomId: room.id } })))
    created.push(record)
  }

  await prisma.payment.createMany({ data: created.map((property) => ({ amount: property.name === 'The Fern House' ? 185000 : property.name === 'North Star Living' ? 142000 : 315000, propertyId: property.id, status: 'paid' })) })
  await prisma.maintenanceRequest.createMany({ data: Array.from({ length: 12 }, (_, index) => ({ title: `Maintenance request ${index + 1}`, propertyId: created[index % created.length].id, status: 'open' })) })
  await prisma.activity.createMany({ data: [
    { title: 'Rent collected', description: 'The Fern House · Room 204', amountLabel: '+ ₹18,500', timeLabel: '12 min ago', tone: 'green', propertyId: created[0].id },
    { title: 'New booking request', description: 'North Star Living · Ananya S.', amountLabel: 'Review', timeLabel: '38 min ago', tone: 'orange', propertyId: created[1].id },
    { title: 'Maintenance resolved', description: 'Casa 21 · Room 118', amountLabel: 'Closed', timeLabel: '1 hr ago', tone: 'blue', propertyId: created[2].id },
  ] })

  console.log(`Seeded ${created.length} properties, 101 residents, and dashboard activity.`)
}

seed().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
