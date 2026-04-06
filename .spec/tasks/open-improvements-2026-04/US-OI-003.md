# US-OI-003: Research Timeout Provider Attribution

> Task ID: US-OI-003
> Type: FEATURE
> Priority: P1
> Estimate: 120 minutes
> Assignee: general-purpose
> Status: ✅ Completed
> Completed: 2026-04-06T12:50:00Z
> Commit: 38bd06a (remediation of e9ea891)
> Reviewer: code-reviewer

## CRITICAL CONSTRAINTS

### MUST
- Read `convex/research/search.ts`, `convex/research/dispatcher.ts`, and `convex/research/mode_prompts.ts` before modifying
- Preserve existing search functionality - timeouts should fail more gracefully, not differently
- Tag errors with which provider (Jina, Exa) caused the timeout

### NEVER
- Change the external API contracts or endpoints
- Remove existing timeout protection (make it better, not absent)
- Add new npm dependencies for retry logic (use simple custom implementation)

### STRICTLY
- Retry logic must use exponential backoff with a max of 3 retries
- Timeout errors must include provider name in the error message
- Failed providers should be skipped gracefully, not crash the entire research session

## SPECIFICATION

**Objective:** Improve research timeout handling to differentiate between providers, add retry with backoff, and degrade gracefully when a provider is unavailable.

**Current State:**
- `search.ts` line ~396: Generic "Search timeout" error with no provider attribution
- `dispatcher.ts` line 376: Hardcoded 15000ms timeout per track worker
- `search.ts` line ~130: Timeout detection checks for "abort" or "timeout" strings only
- No retry/backoff for transient failures
- No visibility into which provider timed out

**Success looks like:** When a search provider times out, the error message names the provider, the system retries with backoff, and if all retries fail, the research continues with remaining providers.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Jina Reader times out | Search is attempted | Error message includes "Jina" provider name | `grep -n 'Jina.*timeout\|timeout.*Jina' convex/research/search.ts` |
| 2 | Exa API times out | Search is attempted | Error message includes "Exa" provider name | `grep -n 'Exa.*timeout\|timeout.*Exa' convex/research/search.ts` |
| 3 | Provider times out once | Retry is attempted | System retries with exponential backoff (up to 3 times) | `grep -n 'retry\|backoff\|attempt' convex/research/search.ts` |
| 4 | Provider fails all retries | Research continues | Other providers' results still return, partial results surfaced | Review dispatcher error handling for graceful degradation |
| 5 | No timeouts occur | Normal search flow | Behavior is identical to current implementation | Run a successful research query |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Jina timeout errors include "Jina" in the error message | AC-1 | `grep -c 'Jina' convex/research/search.ts` > 0 in timeout/error context | [x] TRUE [ ] FALSE |
| 2 | Exa timeout errors include "Exa" in the error message | AC-2 | `grep -c 'Exa' convex/research/search.ts` > 0 in timeout/error context | [x] TRUE [ ] FALSE |
| 3 | Retry logic exists with exponential backoff pattern | AC-3 | `grep -E 'retry|backoff|attempt.*[0-9]' convex/research/search.ts | wc -l` > 0 | [x] TRUE [ ] FALSE |
| 4 | TypeScript compiles without errors | AC-1-5 | `pnpm tsc --noEmit` exits 0 | [x] TRUE [ ] FALSE |
| 5 | All existing tests pass | AC-5 | `pnpm vitest run` exits 0 | [x] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/research/search.ts` (MODIFY) - Add provider-tagged errors, retry logic
- `convex/research/dispatcher.ts` (MODIFY) - Update timeout handling, graceful degradation
- `convex/research/mode_prompts.ts` (MODIFY) - Adjust timeout budgets if needed

### WRITE-PROHIBITED
- `convex/schema.ts` - No schema changes needed
- `convex/research/mutations.ts` - Data storage doesn't change
- External API clients - Don't modify how we call Jina/Exa, only how we handle failures

## DESIGN

### Retry with backoff helper
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { provider: string; maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const { provider, maxRetries = 3, baseDelayMs = 1000 } = opts
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`${provider} search failed after ${maxRetries} attempts: ${error}`)
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('unreachable')
}
```

### Graceful degradation in dispatcher
```typescript
// In dispatcher.ts - catch provider failures, continue with remaining results
const results = await Promise.allSettled(trackPromises)
const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value)
const failed = results.filter(r => r.status === 'rejected')
for (const f of failed) {
  console.warn(`Track failed: ${f.reason}`) // Provider name is in the error message
}
// Continue aggregation with successful results only
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**: N/A (backend only)
- **CLAUDE.md**: Commit automatically, run all pre-commit checks

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/research/search.ts` - ALL
   Focus: `readUrlWithJina()` (lines 61-139), `executeExaSearch()` (lines 432-480), timeout handling

2. `convex/research/dispatcher.ts` - ALL
   Focus: Worker timeout at line 376, error handling patterns

3. `convex/research/mode_prompts.ts` - Lines 346-358
   Focus: Mode-specific timeout configurations
