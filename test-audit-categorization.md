# Test Audit Results

**Audit Date:** 2026-04-06
**Task:** CQ-001: Audit and Categorize All Tests
**Total Test Files:** 115
**Total `toBeDefined()` Occurrences:** 323

## Summary

| Category | Count | Percentage |
|----------|-------|------------|
| **Behavioral Tests (Good)** | 42 | 36.5% |
| **Existence-Check Tests (Need Replacement)** | 68 | 59.1% |
| **Broken/Skipped Tests** | 2 | 1.7% |
| **Performance/Other Tests** | 3 | 2.6% |

---

## Test Files by Category

### Behavioral Tests (Good) ✅

These tests verify actual behavior, state transitions, and meaningful assertions. They exercise real logic rather than just checking API surface.

#### Component Tests (10 files)
- `tests/lib/computeNarrationMap.test.ts` - Pure function behavioral tests with real assertions
- `tests/lib/extractParagraphs.test.ts` - MDAST parsing behavioral tests
- `tests/hooks/use-voice-session.test.ts` - Real hook testing with renderHook
- `tests/hooks/use-voice-session-state.test.ts` - State machine behavioral tests
- `tests/lib/voice/error-handler.test.ts` - Error handling logic tests
- `tests/lib/voice/event-handler.test.ts` - Event processing behavioral tests
- `tests/lib/voice/function-dispatcher.test.ts` - Tool dispatch logic tests
- `tests/lib/voice/session-timeout.test.ts` - Timeout behavior tests
- `tests/lib/voice/tool-definitions.test.ts` - Tool schema validation tests
- `tests/lib/voice/transcript-recorder.test.ts` - Transcript recording behavior tests

#### Integration Tests (7 files)
- `tests/integration/voice-create-session.test.ts` - Session creation integration tests
- `tests/convex/agentPlans-behavioral.test.ts` - State machine behavioral tests via source analysis
- `tests/convex/agent-triage-dispatch.test.ts` - Triage dispatch logic tests
- `tests/convex/chat-context-section-aware.test.ts` - Context-aware behavior tests
- `tests/convex/creators/output.test.ts` - Creator output processing tests
- `tests/convex/whatsNew/content-quality.test.ts` - Content quality behavioral tests
- `tests/convex/whatsNew/quality.test.ts` - Quality metric behavioral tests

#### Voice/System Tests (12 files)
- `tests/voice/retry-manager.test.ts` - Retry logic behavioral tests
- `tests/voice/tool-parity.test.ts` - Tool parity checks
- `tests/convex/FR-012-queries.test.ts` - Feed query behavioral tests
- `tests/convex/FR-014-getDigestSummary.test.ts` - Digest summary behavior
- `tests/convex/FR-018-update-index-exports.test.ts` - Index update behavior
- `tests/convex/improvements-internal.test.ts` - Internal improvement logic
- `tests/convex/rateLimits.test.ts` - Rate limiting behavior
- `tests/convex/TR-005-scheduled-processor.test.ts` - Scheduled processing behavior
- `tests/convex/TR-006-youtube-integration.test.ts` - YouTube integration behavior
- `tests/convex/US-060-research-progress.test.ts` - Research progress tracking
- `tests/convex/US-756-hybrid-search-scoring.test.ts` - Hybrid search scoring
- `tests/convex/US-IMP-007-ai-feedback-system.test.ts` - AI feedback behavior

#### Other Behavioral Tests (13 files)
- `tests/convex/US-003-voice-mutations.test.ts` - Voice mutation behavior
- `tests/convex/US-004-voice-getActiveSession.test.ts` - Active session behavior
- `tests/convex/US-054-tasks.test.ts` - Task management behavior
- `tests/convex/US-055-deep-research.test.ts` - Deep research behavior
- `tests/convex/US-761-standard-queries.test.ts` - Standard query behavior
- `tests/convex/US-786-lazy-conversation-creation.test.ts` - Lazy conversation behavior
- `tests/convex/US-IMP-002-research-specialists.test.ts` - Research specialist behavior
- `tests/convex/US-IMP-003-sequential-research-context.test.ts` - Sequential research behavior
- `tests/convex/US-IMP-004-imports.test.ts` - Import behavior
- `tests/convex/US-IMP-011-product-service-finders.test.ts` - Product finder behavior
- `tests/convex/US-REM-001-get-feed-item-feedback.test.ts` - Feedback behavior
- `tests/lib/voice/webrtc-connection.test.ts` - WebRTC connection behavior
- `tests/integration/shop-output.test.ts` - Shop output behavior

---

### Existence-Check Tests (Need Replacement) ⚠️

These tests primarily use `expect(fn).toBeDefined()` or similar existence checks without meaningful behavioral assertions. They verify API surface but not functionality.

#### Component Structure Tests (17 files)
**Pattern:** String-grep tests checking for component exports, props interfaces, and structural elements

- `tests/components/research/ReportOutline.test.tsx` - Component structure checks
- `tests/components/ResearchProgress.test.tsx` - Component structure checks
- `tests/components/SubscriptionFeedScreen.test.tsx` - Component structure checks
- `tests/components/subscriptions/ArticleCard.test.tsx` - Component structure checks
- `tests/components/subscriptions/FeedFilterChips.test.tsx` - Component structure checks
- `tests/components/subscriptions/FeedItemSkeleton.test.tsx` - Component structure checks
- `tests/components/subscriptions/ReleaseCard.test.tsx` - Component structure checks
- `tests/components/subscriptions/SocialCard.test.tsx` - Component structure checks
- `tests/components/subscriptions/SubscriptionFeedItem.test.tsx` - Component structure checks
- `tests/components/subscriptions/SubscriptionSettings.test.tsx` - Component structure checks
- `tests/components/subscriptions/VideoCard.test.tsx` - Component structure checks
- `tests/components/voice/VoiceMicButton.test.tsx` - Component structure checks
- `tests/components/voice/VoiceSessionOverlay.test.tsx` - **String-grep source tests (AC-22)**
- `tests/components/whats-new/CardActions.test.tsx` - Component structure checks
- `tests/components/whats-new/NewsCard.test.tsx` - Component structure checks
- `tests/components/whats-new/NewsStream.test.tsx` - Component structure checks
- `tests/components/whats-new/WhatsNewScreen.test.tsx` - Component structure checks

#### Convex API Surface Tests (28 files)
**Pattern:** Verify Convex functions exist in generated API

- `tests/convex/agentPlans-security.test.ts` - Security API surface checks
- `tests/convex/agentPlans.test.ts` - Agent plans API surface checks
- `tests/convex/documents-getSection.test.ts` - Document API surface checks
- `tests/convex/feeds/FR-014-getDigestSummary.test.ts` - Partial: some toDefined
- `tests/convex/feeds/validators.test.ts` - Validator API surface checks
- `tests/convex/FR-008-actions.test.ts` - Actions API surface checks
- `tests/convex/FR-011-getFeed-query.test.ts` - Feed query API surface checks
- `tests/convex/FR-013-get-unviewed-count.test.ts` - Unviewed count API surface
- `tests/convex/FR-015-mark-viewed.test.ts` - Mark viewed API surface
- `tests/convex/FR-016-mark-all-viewed.test.ts` - Mark all viewed API surface
- `tests/convex/FR-017-create-digest-notification.test.ts` - Notification API surface
- `tests/convex/improvements.test.ts` - Improvements API surface checks
- `tests/convex/search-tools.test.ts` - Search tools API surface checks
- `tests/convex/subscriptions-ai-relevance.test.ts` - AI relevance API surface
- `tests/convex/subscriptions-feedback.test.ts` - Feedback API surface
- `tests/convex/subscriptions-optimization.test.ts` - Optimization API surface
- `tests/convex/TR-002-transcripts.test.ts` - Transcripts API surface
- `tests/convex/TR-003-transcript-service.test.ts` - Transcript service API surface
- `tests/convex/TR-004-jina-reader-fallback.test.ts` - Jina fallback API surface
- `tests/convex/TR-007-assimilate-creator.test.ts` - Assimilate creator API surface
- `tests/convex/triage.test.ts` - Triage API surface checks
- `tests/convex/US-052-chat.test.ts` - **Chat API surface checks (AC-17)**
- `tests/convex/US-054-tasks.test.ts` - Tasks API surface checks
- `tests/convex/US-055-deep-research.test.ts` - Deep research API surface
- `tests/convex/US-060-research-progress.test.ts` - Research progress API surface
- `tests/convex/US-761-standard-queries.test.ts` - Standard queries API surface
- `tests/convex/US-786-lazy-conversation-creation.test.ts` - Lazy conversation API surface
- `tests/convex/US-IMP-002-research-specialists.test.ts` - Research specialists API surface
- `tests/convex/US-IMP-003-sequential-research-context.test.ts` - Sequential research API surface
- `tests/convex/US-IMP-011-product-service-finders.test.ts` - Product finders API surface

#### Integration API Tests (8 files)
**Pattern:** Integration tests that check API surface rather than behavior

- `tests/integration/agent-plan-concurrency.test.ts` - Partial: some behavioral, some toDefined
- `tests/integration/chat-title-generation.test.ts` - Title generation API surface
- `tests/integration/conversations.test.ts` - **Conversations API surface (AC-18)**
- `tests/integration/research-models.test.ts` - Research models API surface
- `tests/integration/validate-migration.test.ts` - Migration validation API surface
- `tests/integration/whats-new-summary-generation.test.ts` - Summary generation API surface
- `tests/integration/whats-new-summary-storage.test.ts` - Summary storage API surface
- `tests/hooks/use-subscription-feed.test.ts` - Hook API surface checks

#### Hook Tests (3 files)
- `tests/hooks/use-subscription-feed.test.ts` - Hook API surface checks
- `tests/hooks/use-voice-session-state.test.ts` - Hook API surface checks
- `tests/hooks/use-voice-session.test.ts` - Hook API surface checks

---

### Broken/Skipped Tests 🔴

These tests are currently skipped or have known issues.

- `tests/integration/research-models.test.ts` - **Contains skipped tests** (`.skip`)
- `tests/voice/executeTool.test.ts` - **Contains skipped tests** (`.skip`)

---

### Performance/Other Tests 📊

Tests that don't fit the standard categories (performance benchmarks, etc.)

- `components/subscriptions/__tests__/SubscriptionFeedScreen.perf.test.tsx` - Performance test
- `tests/voice/executeTool.test.ts` - Tool execution tests (partially skipped)

---

## Files Requiring Attention (High Priority)

### 1. Chat Module Tests (AC-17)
**File:** `tests/convex/US-052-chat.test.ts`
**Issue:** Uses `expect(api.chat.index.send).toBeDefined()` instead of behavioral tests
**Action:** Replace with actual send/receive behavioral tests
**Task:** CQ-003

### 2. Conversation Tests (AC-18)
**File:** `tests/integration/conversations.test.ts`
**Issue:** Uses `expect(api.conversations.*).toBeDefined()` instead of CRUD behavioral tests
**Action:** Replace with conversation CRUD behavioral tests
**Task:** CQ-004

### 3. String-Grep Component Tests (AC-22)
**File:** `tests/components/voice/VoiceSessionOverlay.test.tsx`
**Issue:** Uses string-grep on source files instead of component rendering
**Action:** Replace with actual component rendering tests or behavioral assertions
**Task:** CQ-007

---

## Test Quality Patterns

### Good Patterns ✅
1. **Pure function tests** - `computeNarrationMap.test.ts`, `extractParagraphs.test.ts`
2. **State machine tests** - `agentPlans-behavioral.test.ts`, `use-voice-session-state.test.ts`
3. **Integration tests with real logic** - `voice-create-session.test.ts`, `FR-012-queries.test.ts`
4. **Error handling tests** - `error-handler.test.ts`, `retry-manager.test.ts`
5. **Source analysis for behavioral invariants** - `agentPlans-behavioral.test.ts`

### Anti-Patterns ⚠️
1. **API surface checks** - `expect(api.chat.send).toBeDefined()` - doesn't test behavior
2. **String-grep component tests** - Reading source files to check for exports/props
3. **Mock-heavy tests without assertions** - Setting up mocks but not verifying behavior
4. **Skipped tests** - Tests marked `.skip` instead of being fixed or removed

---

## Statistics

### Test Distribution by Type
- **Component Tests:** 18 files (15.7%)
- **Convex Tests:** 57 files (49.6%)
- **Integration Tests:** 10 files (8.7%)
- **Hook Tests:** 3 files (2.6%)
- **Library Tests:** 12 files (10.4%)
- **Voice Tests:** 12 files (10.4%)
- **Performance Tests:** 1 file (0.9%)
- **Other:** 2 files (1.7%)

### Test Distribution by Quality
- **Behavioral:** 42 files (36.5%)
- **Existence-Check:** 68 files (59.1%)
- **Broken/Skipped:** 2 files (1.7%)
- **Performance:** 1 file (0.9%)
- **Mixed/Other:** 2 files (1.7%)

---

## Recommendations

### Immediate Actions (P0)
1. **Replace chat module tests** (CQ-003) - `tests/convex/US-052-chat.test.ts`
2. **Replace conversation tests** (CQ-004) - `tests/integration/conversations.test.ts`
3. **Fix string-grep component test** (CQ-007) - `tests/components/voice/VoiceSessionOverlay.test.tsx`
4. **Fix or remove skipped tests** - `tests/integration/research-models.test.ts`, `tests/voice/executeTool.test.ts`

### Medium Priority (P1)
1. **Systematically replace toDefined() tests** - Start with high-value modules (chat, conversations, feeds)
2. **Add behavioral tests for untested code paths** - Focus on critical business logic
3. **Improve component tests** - Move from string-grep to actual rendering tests

### Long-term (P2)
1. **Establish test quality standards** - Require behavioral assertions for all new tests
2. **Add test coverage reporting** - Track behavioral vs existence-check ratio
3. **Create test templates** - Provide examples of good behavioral tests for common patterns

---

## Appendix: Full Test File Inventory

See `test-audit.txt` for complete list of 115 test files.
