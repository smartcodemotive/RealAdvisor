# Code Review: `dashboardStats` resolver snippet

## Findings (ordered by severity)

- **Critical – scalability / performance**: `SELECT * FROM properties WHERE agent_id = $1` loads every property for the agent. At 100k+ rows this will OOM, exceed pool timeouts, and make the API unusable. Dashboard stats should be computed with SQL aggregates (`COUNT`, `SUM`, `AVG`, `GROUP BY`) and tight `SELECT` projections.

- **Critical – async bug in `reduce`**: `reduce(async ...)` returns a **Promise** per iteration and does not await sequentially unless you use an async IIFE or `for...of`. As written, it likely fires many concurrent queries and the accumulator handling is error-prone. Even if “fixed” to await sequentially, it remains an N+1 query pattern.

- **High – incorrect average days to sell**: divides by `properties.rows.length` instead of `sold.length`. This shrinks the average incorrectly when there are non-sold listings and can produce misleading dashboard metrics.

- **High – date comparison bug**: compares `p.sold_date > Date.now() - ...` where `sold_date` is presumably a `Date`/string from SQL, not a numeric timestamp. This can yield incorrect filtering for recent sales depending on driver/types.

- **Medium – missing edge cases**: properties sold without `sold_date` (or missing `created_at`) can yield `NaN` in averages; no filtering for nulls.

- **Medium – incomplete stats contract**: snippet returns only a subset of likely-required stats; also recomputes counts per property repeatedly instead of a single grouped query.

## Suggested direction (what I’d ask the author to change)

- Replace per-property counting with one query:

```sql
SELECT COUNT(*) FROM property_views pv
JOIN properties p ON p.id = pv.property_id
WHERE p.agent_id = $1;
```

- Compute status breakdown via `GROUP BY status`.
- Compute recent sales via `WHERE status='sold' AND sold_date >= now() - interval '30 days'`.
- Compute average time-to-sell using SQL `AVG(sold_date - activated_date)` (or appropriate timestamps) **only across sold rows**.

## Why this matters

Dashboard endpoints become the hottest path in the product; doing O(n) queries per request is both a reliability incident waiting to happen and a poor user experience. Correctness issues (averages, date comparisons) erode trust in analytics, which is especially damaging in a fraud-detection context.