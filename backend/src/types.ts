import { PrismaClient } from "@prisma/client";

export type GraphqlContext = {
  prisma: PrismaClient;
  agentId: string | null;
};
