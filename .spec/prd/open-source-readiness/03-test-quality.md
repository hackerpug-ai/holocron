# 2.3 Test Quality Overhaul (P1)

Replace existence-check tests with behavioral tests that actually catch regressions.

## Acceptance Criteria

- [ ] AC-16: All tests that only check `expect(fn).toBeDefined()` are deleted or replaced with behavioral tests
- [ ] AC-17: `tests/convex/US-052-chat.test.ts` replaced with behavioral tests for the chat send flow (message persistence, AI response generation)
- [ ] AC-18: `tests/integration/conversations.test.ts` replaced with behavioral tests for conversation CRUD operations
- [ ] AC-19: New behavioral tests added for `convex/research/confidence.ts` — edge cases: zero sources, max scores, boundary between HIGH/MEDIUM
- [ ] AC-20: New behavioral tests for `convex/research/termination.ts` — inputs near threshold values, all termination criteria paths
- [ ] AC-21: `pnpm vitest run` passes with all new tests
- [ ] AC-22: String-grep source tests (e.g., `VoiceSessionOverlay.test.tsx` reading source as string) replaced with proper component render tests or deleted
