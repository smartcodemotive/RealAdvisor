import { PropertyStatus, Prisma } from "@prisma/client";
import { comparePassword, signToken } from "./auth.js";
import { runDetectionRules } from "./detection.js";
import type { GraphqlContext } from "./types.js";

const requireAuth = (ctx: GraphqlContext): string => {
  if (!ctx.agentId) throw new Error("Unauthorized");
  return ctx.agentId;
};

const toFloat = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

export const resolvers = {
  Property: {
    price: (p: any) => toFloat(p.price),
    surfaceM2: (p: any) => toFloat(p.surfaceM2),
    viewCount: async (p: any, _: unknown, ctx: GraphqlContext) => {
      if (typeof p.viewCount === "number") return p.viewCount;
      return ctx.prisma.propertyView.count({ where: { propertyId: p.id } });
    },
    openFlagCount: async (p: any, _: unknown, ctx: GraphqlContext) => {
      if (typeof p.openFlagCount === "number") return p.openFlagCount;
      return ctx.prisma.propertyFlag.count({
        where: { propertyId: p.id, state: "OPEN" },
      });
    },
    flags: async (p: any, _: unknown, ctx: GraphqlContext) =>
      ctx.prisma.propertyFlag.findMany({ where: { propertyId: p.id } }),
  },
  Agent: {
    agency: (a: any, _: unknown, ctx: GraphqlContext) =>
      ctx.prisma.agency.findUniqueOrThrow({ where: { id: a.agencyId } }),
  },
  PropertyFlag: {
    property: async (flag: any, _: unknown, ctx: GraphqlContext) => {
      if (flag.property) return flag.property;
      return ctx.prisma.property.findUniqueOrThrow({ where: { id: flag.propertyId } });
    },
  },
  Query: {
    me: (_: unknown, __: unknown, ctx: GraphqlContext) =>
      ctx.agentId ? ctx.prisma.agent.findUnique({ where: { id: ctx.agentId } }) : null,
    dashboardStats: async (_: unknown, __: unknown, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const now = new Date();
      const last30 = new Date(now.getTime() - 30 * 86400000);

      const [statusRows, viewsAll, views30, recentSales, top, soldRows, byDay] =
        await Promise.all([
          ctx.prisma.property.groupBy({
            by: ["status"],
            where: { agentId },
            _count: { _all: true },
          }),
          ctx.prisma.propertyView.count({
            where: { property: { agentId } },
          }),
          ctx.prisma.propertyView.count({
            where: { property: { agentId }, viewedAt: { gte: last30 } },
          }),
          ctx.prisma.property.findMany({
            where: { agentId, status: "SOLD", soldAt: { gte: last30 } },
            select: { price: true },
          }),
          ctx.prisma.propertyView.groupBy({
            by: ["propertyId"],
            where: { property: { agentId } },
            _count: { propertyId: true },
            orderBy: { _count: { propertyId: "desc" } },
            take: 5,
          }),
          ctx.prisma.property.findMany({
            where: { agentId, status: "SOLD", soldAt: { not: null }, activatedAt: { not: null } },
            select: { soldAt: true, activatedAt: true },
          }),
          ctx.prisma.$queryRaw<Array<{ day: Date; views: bigint }>>`
            SELECT date_trunc('day', pv."viewedAt") AS day, COUNT(*)::bigint AS views
            FROM "PropertyView" pv
            JOIN "Property" p ON p."id" = pv."propertyId"
            WHERE p."agentId" = ${agentId} AND pv."viewedAt" >= ${last30}
            GROUP BY day
            ORDER BY day ASC
          `,
        ]);

      const propertyMap = new Map(
        (
          await ctx.prisma.property.findMany({
            where: { id: { in: top.map((x) => x.propertyId) } },
          })
        ).map((p) => [p.id, p])
      );

      const averageDaysToSell = soldRows.length
        ? soldRows.reduce((sum, row) => {
            const soldAt = row.soldAt?.getTime() ?? 0;
            const activeAt = row.activatedAt?.getTime() ?? soldAt;
            return sum + (soldAt - activeAt) / 86400000;
          }, 0) / soldRows.length
        : 0;

      return {
        statusCounts: statusRows.map((s) => ({ status: s.status, count: s._count._all })),
        totalViewsAllTime: viewsAll,
        totalViewsLast30Days: views30,
        recentSalesCount: recentSales.length,
        recentSalesRevenue: recentSales.reduce((sum, row) => sum + Number(row.price), 0),
        averageDaysToSell,
        topViewedProperties: top
          .map((t) => ({ property: propertyMap.get(t.propertyId), views: t._count.propertyId }))
          .filter((x) => !!x.property),
        viewsByDayLast30Days: byDay.map((r) => ({
          date: r.day.toISOString().slice(0, 10),
          views: Number(r.views),
        })),
      };
    },
    myProperties: async (_: unknown, args: any, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const filters = args.filters ?? {};
      const page = Math.max(1, filters.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
      const where: Prisma.PropertyWhereInput = { agentId };
      if (filters.status) where.status = filters.status as PropertyStatus;
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
        if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
      }
      const [items, total] = await Promise.all([
        ctx.prisma.property.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ctx.prisma.property.count({ where }),
      ]);

      const ids = items.map((p) => p.id);
      const [views, flags] = await Promise.all([
        ids.length
          ? ctx.prisma.propertyView.groupBy({
              by: ["propertyId"],
              where: { propertyId: { in: ids } },
              _count: { propertyId: true },
            })
          : Promise.resolve([]),
        ids.length
          ? ctx.prisma.propertyFlag.groupBy({
              by: ["propertyId"],
              where: { propertyId: { in: ids }, state: "OPEN" },
              _count: { propertyId: true },
            })
          : Promise.resolve([]),
      ]);

      const viewMap = new Map(views.map((v) => [v.propertyId, v._count.propertyId]));
      const flagMap = new Map(flags.map((f) => [f.propertyId, f._count.propertyId]));

      return {
        items: items.map((p) => ({
          ...p,
          viewCount: viewMap.get(p.id) ?? 0,
          openFlagCount: flagMap.get(p.id) ?? 0,
        })),
        total,
      };
    },
    property: async (_: unknown, args: { id: string }, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      return ctx.prisma.property.findFirst({
        where: { id: args.id, OR: [{ agentId }, { coListedAgentId: agentId }] },
      });
    },
    propertyViews: async (_: unknown, args: any, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const property = await ctx.prisma.property.findFirst({
        where: { id: args.propertyId, OR: [{ agentId }, { coListedAgentId: agentId }] },
      });
      if (!property) throw new Error("Property not found");
      const page = Math.max(1, args.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 25));
      return ctx.prisma.propertyView.findMany({
        where: { propertyId: args.propertyId },
        orderBy: { viewedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
    },
    flaggedProperties: async (_: unknown, args: any, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const page = Math.max(1, args.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20));
      return ctx.prisma.propertyFlag.findMany({
        where: { property: { agentId }, state: "OPEN" },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { property: true },
      });
    },
    detectionStats: async (_: unknown, __: unknown, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const [totalFlagged, autoDetected, manuallyReported] = await Promise.all([
        ctx.prisma.propertyFlag.count({ where: { property: { agentId } } }),
        ctx.prisma.propertyFlag.count({
          where: { property: { agentId }, source: "AUTO" },
        }),
        ctx.prisma.propertyFlag.count({
          where: { property: { agentId }, source: "MANUAL" },
        }),
      ]);
      return { totalFlagged, autoDetected, manuallyReported };
    },
  },
  Mutation: {
    login: async (_: unknown, args: { email: string; password: string }, ctx: GraphqlContext) => {
      const agent = await ctx.prisma.agent.findUnique({ where: { email: args.email } });
      if (!agent) throw new Error("Invalid credentials");
      const valid = await comparePassword(args.password, agent.password);
      if (!valid) throw new Error("Invalid credentials");
      return { token: signToken({ agentId: agent.id, email: agent.email }), agent };
    },
    createProperty: async (_: unknown, args: any, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const input = args.input;
      const now = new Date();
      const created = await ctx.prisma.property.create({
        data: {
          ...input,
          agentId,
          price: input.price,
          surfaceM2: input.surfaceM2,
          activatedAt: input.status === "ACTIVE" ? now : null,
          soldAt: input.status === "SOLD" ? now : null,
          archivedAt: input.status === "ARCHIVED" ? now : null,
        },
      });
      await runDetectionRules(ctx.prisma, created.id);
      return created;
    },
    updateProperty: async (_: unknown, args: any, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const existing = await ctx.prisma.property.findFirst({
        where: { id: args.id, agentId },
      });
      if (!existing) throw new Error("Property not found");

      const input = args.input;
      const now = new Date();
      const updated = await ctx.prisma.property.update({
        where: { id: args.id },
        data: {
          ...input,
          price: input.price,
          surfaceM2: input.surfaceM2,
          activatedAt:
            existing.status !== "ACTIVE" && input.status === "ACTIVE"
              ? now
              : existing.activatedAt,
          soldAt:
            existing.status !== "SOLD" && input.status === "SOLD" ? now : existing.soldAt,
          archivedAt:
            existing.status !== "ARCHIVED" && input.status === "ARCHIVED"
              ? now
              : existing.archivedAt,
        },
      });
      await runDetectionRules(ctx.prisma, updated.id);
      return updated;
    },
    deleteProperty: async (_: unknown, args: { id: string }, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const existing = await ctx.prisma.property.findFirst({
        where: { id: args.id, agentId },
      });
      if (!existing) throw new Error("Property not found");
      await ctx.prisma.propertyView.deleteMany({ where: { propertyId: args.id } });
      await ctx.prisma.propertyFlag.deleteMany({ where: { propertyId: args.id } });
      await ctx.prisma.property.delete({ where: { id: args.id } });
      return true;
    },
    recordPropertyView: async (_: unknown, args: { propertyId: string; viewerEmail?: string }, ctx: GraphqlContext) => {
      await ctx.prisma.propertyView.create({
        data: {
          propertyId: args.propertyId,
          viewerEmail: args.viewerEmail,
          isAnonymous: !args.viewerEmail,
        },
      });
      return true;
    },
    dismissFlag: async (_: unknown, args: { flagId: string; reason: string }, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const flag = await ctx.prisma.propertyFlag.findFirst({
        where: { id: args.flagId, property: { agentId } },
      });
      if (!flag) throw new Error("Flag not found");
      return ctx.prisma.propertyFlag.update({
        where: { id: args.flagId },
        data: {
          state: "DISMISSED",
          reviewedById: agentId,
          reviewReason: args.reason,
          reviewedAt: new Date(),
        },
      });
    },
    confirmFlagAsScam: async (_: unknown, args: { flagId: string; reason: string }, ctx: GraphqlContext) => {
      const agentId = requireAuth(ctx);
      const flag = await ctx.prisma.propertyFlag.findFirst({
        where: { id: args.flagId, property: { agentId } },
        include: { property: true },
      });
      if (!flag) throw new Error("Flag not found");
      await ctx.prisma.property.update({
        where: { id: flag.propertyId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      return ctx.prisma.propertyFlag.update({
        where: { id: args.flagId },
        data: {
          state: "CONFIRMED_SCAM",
          reviewedById: agentId,
          reviewReason: args.reason,
          reviewedAt: new Date(),
        },
      });
    },
  },
};
