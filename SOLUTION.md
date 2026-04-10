# Solution Notes

## Architecture

- **Monorepo** with npm workspaces (`backend`, `frontend`) and a root `dev` script that runs both servers.
- **Backend**: Express + Apollo Server 3 + GraphQL SDL + Prisma ORM.
- **Database**: PostgreSQL with Prisma migrations checked in.
- **Frontend**: Vite + React + Apollo Client + Recharts.
- **Auth**: JWT bearer tokens validated in GraphQL context; mutations/queries that need auth throw `Unauthorized` when missing.

### Why Prisma + Apollo

- Prisma gives type-safe queries, migrations, and straightforward aggregation helpers for dashboard stats.
- Apollo Server is a mature GraphQL stack on Node with minimal wiring for JWT context.

## Database schema (full)

Tables (Prisma models map 1:1 to Postgres tables with quoted PascalCase names):

- `Agency`
  - `id` (cuid), `name`, `createdAt`
- `Agent`
  - `id`, `email` (unique), `name`, `password` (bcrypt hash), `agencyId` (FK), `createdAt`
  - Index: `(agencyId)` for agency dashboards.
- `Property`
  - Core listing fields: title/description/address/geo/type/price/surface/beds/baths
  - Lifecycle: `status` enum (`DRAFT|ACTIVE|SOLD|ARCHIVED`) plus timestamps `activatedAt`, `soldAt`, `archivedAt`
  - Ownership: `agentId` (FK), optional `coListedAgentId` (FK)
  - Indexes:
    - `(agentId, status)` for per-agent filtered lists
    - `(createdAt)` for date-range filters
    - `(city, type, status)` to support peer sampling for scam baselines
- `PropertyView`
  - High-volume fact table: `propertyId`, `viewedAt`, optional `viewerEmail`, `isAnonymous`, optional `viewerId`, `userAgent`
  - Indexes:
    - `(propertyId, viewedAt)` for property detail history + counts
    - `(viewedAt)` for time-bucketed aggregates
- `PropertyFlag`
  - `propertyId`, `source` (`AUTO|MANUAL`), `ruleCode`, `confidence` (0-100), `reasons` (JSON array), optional `details` (JSON)
  - Review workflow: `state` (`OPEN|DISMISSED|CONFIRMED_SCAM`), `reviewedById`, `reviewReason`, `reviewedAt`
  - Indexes:
    - `(propertyId, state)` for open flags per listing
    - `(source, state)` for detection stats

### Normalization choices

- **Agency/Agent** normalized to avoid duplicating agency metadata on every property.
- **Views** stored as rows (not counters) to preserve analytics history and allow time-series charts.
- **Flags** are separate rows rather than JSON on `Property` so multiple rules can fire, history is preserved, and review metadata is explicit.

### Index strategy for scale

- Dashboard aggregates are answered with **SQL aggregates** (`COUNT`, `GROUP BY`, `date_trunc`) instead of loading all properties.
- View ingestion is a single `INSERT` into `PropertyView` (cheap) and does not trigger heavy joins.
- Property lists prefetch `viewCount` and `openFlagCount` via **two grouped queries** over the current page IDs (avoids N+1 field resolvers).

## Scam detection

### Rules implemented

1. **`LOW_PRICE_PER_M2`**
   - Compare listing price/m2 against peers with same `city` + `type` among `ACTIVE|SOLD` listings.
   - Requires at least **5 peers** to avoid noisy baselines.
   - Flags when current price/m2 is **< 55%** of peer average; confidence scales with how far below baseline.

2. **`CROSS_AGENT_DUPLICATE`**
   - Compares normalized `(title + description prefix)` signature and normalized `address`.
   - Only counts as duplicate when the candidate belongs to a **different agent** (prevents false positives for an agent re-listing their own edits).

### When detection runs

- Synchronously after `createProperty` / `updateProperty` for simplicity.
- Auto flags with `source=AUTO` replace prior **open auto flags** for that property to avoid stale duplicates after edits.

### Trade-offs (false positives vs false negatives)

- **Low price/m2** can false-positive on genuine distressed sales or data-entry surface errors; requiring peer count + a steep threshold reduces noise but increases false negatives for rare property types.
- **Duplicate detection** is intentionally simple (string normalization) and may miss paraphrased scams or hit shared building addresses; it favors explainability over recall.

### How I would extend

- Embeddings / fuzzy matching for descriptions; canonical address geocoding + unit numbers.
- Graph features (same phone/email/payment instructions across agents).
- Async pipeline (queue + workers) with idempotent scoring versions and shadow mode before auto-action.

### Scaling to millions of listings

- Precompute rolling baselines per `(city,type,segment)` in OLAP or materialized views.
- Shard detection by geography; use approximate nearest neighbors for duplicates.
- Store rule outputs as events; only persist actionable flags above thresholds.

## Dashboard stats calculations

Implemented in `dashboardStats` resolver using parallel queries:

- **Status counts**: `GROUP BY status` filtered to `agentId`.
- **Views (all time / last 30d)**: `COUNT` on `PropertyView` joined logically via Prisma relation filter on owning agent.
- **Recent sales (30d)**: count + sum of `price` for `SOLD` with `soldAt >= now-30d`.
- **Average days to sell**: average of `(soldAt - activatedAt)` in days for sold properties with both timestamps.
- **Top 5 viewed**: `GROUP BY propertyId` with order by count desc, take 5, hydrate property rows.
- **Views by day (30d)**: SQL `date_trunc('day', viewedAt)` grouped count (fast with `(viewedAt)` index).

## View tracking performance

- `recordPropertyView` is a single insert with indexed `propertyId` + `viewedAt`.
- No read-after-write, no joins — safe under bursty public traffic.

## Auth model

- JWT includes `agentId` + `email`.
- Protected resolvers call `requireAuth`.
- `recordPropertyView` remains public to support anonymous visitor tracking.

## Testing (bonus)

- `backend/src/detectionRules.test.ts` covers an edge case where duplicate-looking listings from the **same agent** must **not** trigger cross-agent duplicate detection.

## What I would improve with more time

- Role-based access (agent vs moderator) and audit logs for flag decisions.
- Background jobs for detection + rate-limited re-evaluation.
- Richer property validation (Zod on GraphQL args), structured GraphQL errors, and integration tests against a test DB.
- Real-time flag updates via subscriptions or SSE.

## 2-hour feature proposal (not implemented)

**Agent reputation risk score**

- **Data model**: `AgentRiskSnapshot` with rolling counters (new listings/day, median price delta vs market, % flagged listings, time-to-first-flag).
- **API**: `agentRisk(agentId)` query + nightly job to refresh snapshots.
- **UI**: small risk badge on dashboard + drill-down panel explaining contributing factors.

This would help prioritize manual review without blocking legitimate high-volume agents, by combining listing velocity with historical flag accuracy.