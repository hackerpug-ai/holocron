# 2.9 Convex Query & Backend Performance (P1)

Eliminate full table scans, replace manual JS computations with native Convex primitives, and fix type-unsafe backend patterns.

## Acceptance Criteria

### Critical — Full Table Scans & Manual Reimplementations

- [ ] AC-46: `convex/documents/queries.ts:161-196` — Replace `ctx.db.query("documents").collect()` full table scan with `ctx.db.query("documents").withSearchIndex("by_category", ...)` for text search and `ctx.vectorSearch("documents", "by_embedding", { vector, limit })` for vector search. Both indexes are already defined in schema but never used in queries.
- [ ] AC-47: `convex/documents/queries.ts:119-151` — Replace manual JS cosine similarity loop over all documents with native `ctx.vectorSearch("documents", "by_embedding", { vector, limit })`. Apply the same fix to `convex/research/queries.ts:13-24` which has the identical anti-pattern.
- [ ] AC-48: `convex/research/actions.ts:133` and `convex/crons.ts:117, 132` — Replace `as any` casts on scheduler/cron function references with `makeFunctionReference<"action">()` (pattern already used correctly in `convex/improvements/mutations.ts:7`), or ensure the target functions are exported via `convex/index.ts` so they appear in the generated `api` object.

### High — Type Safety & Unnecessary Work

- [ ] AC-49: Replace `ctx: any` with proper Convex context types (`ActionCtx`, `MutationCtx`, `QueryCtx` from `convex/server`) in: `convex/research/scheduled.ts:96`, `convex/research/actions.ts:410, 1297`, `convex/subscriptions/internal.ts:1099`, `convex/imports/mutations.ts:11`.
- [ ] AC-50: `convex/schema.ts` lines 169 and 1143 — Replace `confidenceLevel: v.string()` with `v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"))` to enforce the three valid values at the schema level.
- [ ] AC-51: `convex/documents/queries.ts:47-70` — Replace `count` and `countWithFilter` implementations that load entire tables then count in JS with index-filtered queries or denormalized counter documents.
- [ ] AC-52: `convex/research/mutations.ts:146-148` — Delete the post-patch verification `ctx.db.get()` call after `ctx.db.patch()`. Convex mutations are atomic; the read-after-write is unnecessary overhead.
- [ ] AC-53: `convex/research/queries.ts:371-391` — `fullTextSearchIterations` loads all iterations across all sessions then filters in JS. When `sessionId` is provided, use the existing `by_session` index: `ctx.db.query("researchIterations").withIndex("by_session", q => q.eq("sessionId", sessionId))`.

### Medium — Schema Tightening

- [ ] AC-54: `convex/schema.ts:445, 491` — Replace `toolArgs: v.any()` with `v.record(v.string(), v.any())` to enforce object shape at minimum.
- [ ] AC-55: `convex/schema.ts:301` — Replace `ruleValue: v.any()` with `v.union(v.string(), v.number(), v.array(v.string()))` to match the actual value types used.
- [ ] AC-56: `convex/schema.ts:299` — Change `subscriptionFilters.sourceType` from `v.optional(v.string())` to match the union type already defined on `subscriptionSources.sourceType` at line 228.
- [ ] AC-57: `convex/research/mutations.ts:431` — Verify that `api.research.actions.startSmartResearch` exists in the generated API. If the function was renamed or removed, update the reference to the correct function path.
