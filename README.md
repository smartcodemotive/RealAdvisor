# RealAdvisor Agent Dashboard

Full-stack technical challenge implementation with:

- Backend: Node.js, TypeScript, GraphQL, Prisma
- Database: PostgreSQL
- Frontend: React + TypeScript + Vite
- Auth: JWT

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Update `backend/.env` with your PostgreSQL credentials.

### 3) Prepare database

```bash
npm run prisma:generate
npm run prisma:deploy
```

For local development you can also run interactive migrations:

```bash
npm run prisma:migrate --workspace backend -- --name init
```

### 4) Seed data

```bash
npm run seed
```

Seed creates:

- 2 agencies
- 3 agents (`alice@demo.com`, `ben@demo.com`, `clara@demo.com`)
- 20-30 properties per agent with mixed statuses
- 3 months of views
- intentionally suspicious listings

Password for all demo users: `password123`

### 5) Run app

```bash
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend GraphQL: [http://localhost:4000/graphql](http://localhost:4000/graphql)

## Notes

- `recordPropertyView` mutation is public (no auth).
- Dashboard stats are aggregation-based and index-backed for scale.
- Scam detection runs on create/update with two rule families:
  - abnormal low price/m2
  - cross-agent duplicate listing detection
