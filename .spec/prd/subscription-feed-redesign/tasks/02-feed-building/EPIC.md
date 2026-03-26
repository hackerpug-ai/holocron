# EPIC-02: Feed Building System

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-02
**PRD Section**: Phase 1 - Convex Backend Changes (Feed Building Cron Jobs)

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Run feed building manually**: Call `api.feeds.actions.buildFeed` action and verify feed items are created
2. **Schedule feed building**: Add cron job that runs every 2 hours
3. **Verify creator grouping**: Check that content from same creator groups into one feed item
4. **Track feed sessions**: Verify feedSessions table tracks reading sessions

---

## Human Test Steps

1. Open Convex dashboard → navigate to "Functions"
2. Run `api.feeds.actions.buildFeed` action manually
3. Check `feedItems` table — verify items created with proper grouping
4. Check `feedSessions` table — verify session tracking works
5. Run action again — verify no duplicate feed items (idempotent)
6. Add cron job to `convex/crons.ts` — verify schedule works
7. Check that `subscriptionContent.inFeed` field is set to true for grouped content

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-007](FR-007.md) | Create internal feed building action | INFRA | M |
| [FR-008](FR-008.md) | Create public feed building action | INFRA | S |
| [FR-009](FR-009.md) | Add feed building cron job | INFRA | S |
| [FR-010](FR-010.md) | Create feed session tracking | INFRA | M |

---

## Acceptance Criteria (Epic Level)

- [ ] Internal action groups content by creatorProfileId
- [ ] Feed items created with correct counts and metadata
- [ ] Cron job scheduled for every 2 hours
- [ ] Session tracking records feed reading behavior
- [ ] Idempotent action (no duplicates on re-run)

---

## Dependencies

**Blocks**: EPIC-03 (Feed Queries), EPIC-04 (Feed Mutations)
**Requires**: EPIC-01 (Backend Foundation)

---

## Notes

- Feed building runs via cron every 2 hours
- Groups content by creatorProfileId or identifier
- Sets `inFeed: true` on grouped subscriptionContent
- Tracks sessions for analytics (optional but useful)
