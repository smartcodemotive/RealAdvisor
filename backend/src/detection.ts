import { Prisma, PrismaClient } from "@prisma/client";
import { evaluateCrossAgentDuplicate, evaluateLowPricePerM2 } from "./detectionRules.js";

export const runDetectionRules = async (
  prisma: PrismaClient,
  propertyId: string
): Promise<void> => {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return;

  await prisma.propertyFlag.deleteMany({
    where: { propertyId, source: "AUTO", state: "OPEN" },
  });

  const reasons: Array<{
    ruleCode: string;
    confidence: number;
    reasons: unknown;
    details?: unknown;
  }> = [];

  const propertySnapshot = {
    id: property.id,
    agentId: property.agentId,
    city: property.city,
    type: property.type,
    title: property.title,
    description: property.description,
    address: property.address,
    price: Number(property.price),
    surfaceM2: Number(property.surfaceM2),
  };

  // Rule 1: unusually cheap per m2 for same city/type.
  const peers = await prisma.property.findMany({
    where: {
      id: { not: property.id },
      city: property.city,
      type: property.type,
      status: { in: ["ACTIVE", "SOLD"] },
    },
    select: { price: true, surfaceM2: true },
    take: 200,
  });
  const lowPrice = evaluateLowPricePerM2(
    propertySnapshot,
    peers.map((p) => ({ price: Number(p.price), surfaceM2: Number(p.surfaceM2) }))
  );
  if (lowPrice) reasons.push(lowPrice);

  // Rule 2: very similar listing text/address posted by other agents.
  const dupCandidates = await prisma.property.findMany({
    where: { id: { not: property.id } },
    select: { id: true, agentId: true, title: true, description: true, address: true },
    take: 500,
  });
  const duplicate = evaluateCrossAgentDuplicate(propertySnapshot, dupCandidates);
  if (duplicate) reasons.push(duplicate);

  if (!reasons.length) return;

  await prisma.propertyFlag.createMany({
    data: reasons.map((r) => ({
      propertyId: property.id,
      source: "AUTO",
      ruleCode: r.ruleCode,
      confidence: Math.max(0, Math.min(100, Math.round(r.confidence))),
      reasons: r.reasons as Prisma.InputJsonValue,
      details: (r.details ?? null) as Prisma.InputJsonValue,
      state: "OPEN",
    })),
  });
};
