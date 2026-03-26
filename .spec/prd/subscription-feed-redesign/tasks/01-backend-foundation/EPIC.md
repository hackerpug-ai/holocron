# EPIC-01: Backend Foundation

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-01
**PRD Section**: Phase 1 - Convex Backend Changes (Schema & Validators)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Verify schema changes**: Open Convex dashboard and see `feedItems` and `feedSessions` tables
2. **Validate type safety**: Run `pnpm tsc --noEmit` with zero errors
3. **Inspect validators**: View `convex/feeds/validators.ts` with all field definitions

---

## Human Test Steps

1. Run `pnpm tsc --noEmit` — verify zero TypeScript errors
2. Open Convex dashboard → navigate to "Tables"
3. Verify `feedItems` table exists with fields: `groupKey`, `title`, `summary`, `contentType`, `itemCount`, `viewed`, `publishedAt`, `discoveredAt`
4. Verify `feedSessions` table exists with fields: `startTime`, `endTime`, `itemsViewed`, `itemsConsumed`
5. Check `subscriptionContent` table has new optional fields: `feedItemId`, `thumbnailUrl`, `duration`, `authorHandle`
6. Check `notifications` table has new optional fields: `feedItemIds`, `digestCount`, `digestSummary`
7. Run `npx convex dev` locally — verify dashboard loads without schema errors

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-001](FR-001.md) | Add feedItems and feedSessions tables to schema | INFRA | M |
| [FR-002](FR-002.md) | Extend subscriptionContent table with feed metadata | INFRA | S |
| [FR-003](FR-003.md) | Extend notifications table for feed digest support | INFRA | S |
| [FR-004](FR-004.md) | Create feed validators (validators.ts) | INFRA | M |
| [FR-005](FR-005.md) | Create feeds module index file | INFRA | XS |
| [FR-006](FR-006.md) | Verify schema migration safety | INFRA | M |

---

## Acceptance Criteria (Epic Level)

- [ ] All new tables defined in `convex/schema.ts`
- [ ] All optional fields added to existing tables (backward compatible)
- [ ] Validators file created with all field definitions
- [ ] Feeds module index exports validators
- [ ] Type check passes with zero errors
- [ ] Convex dev dashboard loads without schema validation errors

---

## Dependencies

**Blocks**: EPIC-02 (Feed Building System), EPIC-03 (Feed Queries)

**Requires**: None (foundation epic)

---

## Notes

- All schema changes use `v.optional()` for backward compatibility
- New tables are standalone and don't break existing subscription system
- Validators follow patterns from existing modules (subscriptions, notifications)
