import "dotenv/config";
import cors from "cors";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { GraphQLScalarType, Kind } from "graphql";
import { verifyToken } from "./auth.js";
import { prisma } from "./db.js";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./typeDefs.js";
import type { GraphqlContext } from "./types.js";

const buildContext = (req: express.Request): GraphqlContext => {
  const tokenHeader = req.headers.authorization;
  const token = tokenHeader?.startsWith("Bearer ") ? tokenHeader.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  return { prisma, agentId: payload?.agentId ?? null };
};

const jsonScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => {
    if (ast.kind === Kind.STRING) return ast.value;
    return null;
  },
});

const server = new ApolloServer({
  typeDefs,
  resolvers: {
    JSON: jsonScalar,
    ...resolvers,
  },
  context: ({ req }) => buildContext(req as express.Request),
});

const app = express();
app.use(cors());

await server.start();
server.applyMiddleware({ app, path: "/graphql" });

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`GraphQL running on http://localhost:${port}/graphql`);
});
