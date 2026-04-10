import "dotenv/config";
import { PropertyStatus } from "@prisma/client";
import { hashPassword } from "./auth.js";
import { prisma } from "./db.js";
import { runDetectionRules } from "./detection.js";

const cities = ["Zurich", "Geneva", "Lausanne", "Basel"];
const types = ["apartment", "house", "studio"];
const statuses: PropertyStatus[] = ["DRAFT", "ACTIVE", "SOLD", "ARCHIVED"];

const random = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const dayMs = 86400000;

async function main() {
  await prisma.propertyView.deleteMany();
  await prisma.propertyFlag.deleteMany();
  await prisma.property.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.agency.deleteMany();

  const agencyA = await prisma.agency.create({ data: { name: "Lakefront Realty" } });
  const agencyB = await prisma.agency.create({ data: { name: "Alpine Homes" } });
  const pass = await hashPassword("password123");

  const agents = await Promise.all([
    prisma.agent.create({
      data: { name: "Alice Meyer", email: "alice@demo.com", password: pass, agencyId: agencyA.id },
    }),
    prisma.agent.create({
      data: { name: "Ben Fischer", email: "ben@demo.com", password: pass, agencyId: agencyA.id },
    }),
    prisma.agent.create({
      data: { name: "Clara Dubois", email: "clara@demo.com", password: pass, agencyId: agencyB.id },
    }),
  ]);

  const createdPropertyIds: string[] = [];

  for (const agent of agents) {
    const total = randInt(20, 30);
    for (let i = 0; i < total; i += 1) {
      const status = random(statuses);
      const createdAt = new Date(Date.now() - randInt(1, 90) * dayMs);
      const activatedAt = status === "ACTIVE" || status === "SOLD" ? new Date(createdAt.getTime() + randInt(1, 8) * dayMs) : null;
      const soldAt = status === "SOLD" && activatedAt ? new Date(activatedAt.getTime() + randInt(5, 45) * dayMs) : null;
      const archivedAt = status === "ARCHIVED" ? new Date(createdAt.getTime() + randInt(5, 60) * dayMs) : null;

      const surface = randInt(25, 220);
      const city = random(cities);
      const type = random(types);
      const pricePerM2 = city === "Zurich" ? randInt(11000, 18000) : randInt(7000, 14000);
      const property = await prisma.property.create({
        data: {
          title: `${city} ${type} #${i + 1}`,
          description: `Bright ${type} in ${city} with great natural light and modern kitchen.`,
          address: `${randInt(1, 190)} Main Street`,
          city,
          zipCode: `10${randInt(10, 99)}`,
          country: "Switzerland",
          type,
          price: surface * pricePerM2,
          surfaceM2: surface,
          bedrooms: randInt(1, 5),
          bathrooms: randInt(1, 3),
          status,
          agentId: agent.id,
          coListedAgentId: Math.random() < 0.2 ? random(agents.filter((a) => a.id !== agent.id)).id : null,
          createdAt,
          activatedAt,
          soldAt,
          archivedAt,
        },
      });
      createdPropertyIds.push(property.id);
    }
  }

  // Inject suspicious listings.
  const duplicateDescription = "Luxury penthouse with lake view, urgent sale, owner relocating abroad.";
  const suspicious = await Promise.all([
    prisma.property.create({
      data: {
        title: "Urgent Zurich Penthouse",
        description: duplicateDescription,
        address: "12 Gold Street",
        city: "Zurich",
        zipCode: "8001",
        country: "Switzerland",
        type: "apartment",
        price: 280000,
        surfaceM2: 120,
        bedrooms: 3,
        bathrooms: 2,
        status: "ACTIVE",
        agentId: agents[0].id,
        activatedAt: new Date(),
      },
    }),
    prisma.property.create({
      data: {
        title: "Urgent Zurich Penthouse",
        description: duplicateDescription,
        address: "12 Gold Street",
        city: "Zurich",
        zipCode: "8001",
        country: "Switzerland",
        type: "apartment",
        price: 310000,
        surfaceM2: 125,
        bedrooms: 3,
        bathrooms: 2,
        status: "ACTIVE",
        agentId: agents[1].id,
        activatedAt: new Date(),
      },
    }),
    prisma.property.create({
      data: {
        title: "Central Geneva Studio",
        description: "Discount listing for immediate move-in.",
        address: "3 Rue du Port",
        city: "Geneva",
        zipCode: "1200",
        country: "Switzerland",
        type: "studio",
        price: 65000,
        surfaceM2: 40,
        bedrooms: 1,
        bathrooms: 1,
        status: "ACTIVE",
        agentId: agents[2].id,
        activatedAt: new Date(),
      },
    }),
  ]);
  createdPropertyIds.push(...suspicious.map((p) => p.id));

  for (const propertyId of createdPropertyIds) {
    const views = randInt(10, 220);
    for (let i = 0; i < views; i += 1) {
      await prisma.propertyView.create({
        data: {
          propertyId,
          viewedAt: new Date(Date.now() - randInt(0, 89) * dayMs - randInt(0, dayMs)),
          viewerEmail: Math.random() < 0.25 ? `viewer${randInt(1, 4000)}@mail.com` : null,
          isAnonymous: Math.random() < 0.75,
        },
      });
    }
  }

  for (const propertyId of createdPropertyIds) {
    await runDetectionRules(prisma, propertyId);
  }

  console.log("Seed complete.");
  console.log("Login users: alice@demo.com, ben@demo.com, clara@demo.com / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
