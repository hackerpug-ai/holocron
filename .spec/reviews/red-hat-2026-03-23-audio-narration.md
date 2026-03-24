# Red-Hat Review Report

**Report Date**: 2026-03-23
**Target**: Audio Narration Feature (Tasks #71-#78)
**Reviewed By**: convex-reviewer, code-reviewer

## Executive Summary

The audio narration feature has **2 critical bugs** that will cause broken UX in production, **3 high-severity architectural issues** in the Convex backend that prevent the stuck-detection cron from ever firing, and **several medium-severity issues** around error handling and state machine edge cases. The most impactful fix is a 2-line change to transition jobs to "running" status; the second is removing the premature `onAllReady()` call.

---

## HIGH Confidence Findings (Both Agents Agree)

- [ ] **CRITICAL: `onAllReady()` called prematurely in `handleToggleNarration`** | Severity: Critical
      `generateAction` only *schedules* segment generation but `onAllReady()` is called immediately after, transitioning state to `'ready'`. User presses play, `audioUrl` is null, infinite spinner with no indication generation is in progress.
      Agents: convex-reviewer, code-reviewer
      File: `app/document/[id].tsx:200-203`
      **Fix**: Remove `narration.onAllReady()` from `handleToggleNarration`. Let the reactive `useEffect` on `segments` handle readiness.

- [ ] **CRITICAL: Job status never transitions to "running" — cron is permanently blind** | Severity: Critical
      Schema defines `"running"`, cron queries `by_status = "running"`, but no code path ever sets a job to `"running"`. Stuck segments/jobs are never cleaned up.
      Agents: convex-reviewer, code-reviewer (indirectly via state machine analysis)
      Files: `convex/audio/mutations.ts`, `convex/audio/scheduled.ts`
      **Fix**: In `markGenerating`, also patch the parent job to `status: "running"` if it's still `"pending"`.

- [ ] **HIGH: Retry does not decrement `failedSegments` on parent job** | Severity: High
      `resetSegmentForRetry` resets segment to pending but doesn't adjust `job.failedSegments`. After successful retry, `completedSegments + failedSegments > totalSegments`, permanently corrupting the job's completion check.
      Agents: convex-reviewer
      File: `convex/audio/mutations.ts:251-273`
      **Fix**: Decrement `job.failedSegments` inside `resetSegmentForRetry` when resetting.

- [ ] **HIGH: `createSegments` idempotency check is coarse-grained** | Severity: High
      If *any* segment exists for the document, all existing IDs are returned without verifying they match the requested paragraphs. Changed document content → wrong text mapped to wrong segments.
      Agents: convex-reviewer
      File: `convex/audio/mutations.ts:108-141`
      **Fix**: Compare paragraph count and hashes, not just existence.

- [ ] **HIGH: Double-toggle state corruption** | Severity: High
      If user taps narration toggle twice rapidly: first tap enters generating + awaits action, second tap exits. When the first await resolves, `onAllReady()` fires on idle state, setting status to `'ready'` with `isNarrationMode = true` but no active subscriptions.
      Agents: code-reviewer
      File: `app/document/[id].tsx:191-209`
      **Fix**: Guard `handleToggleNarration` with a loading ref to prevent double-tap.

- [ ] **HIGH: `segments.length` vs actual completion count in `onAllReady` trigger** | Severity: High
      `useEffect` fires `onAllReady()` when `completedCount === segments.length`, but Convex may not have delivered all segment rows yet. Should compare against `audioJob.totalSegments`.
      Agents: code-reviewer
      File: `app/document/[id].tsx:111-113`

- [ ] **HIGH: No user-visible error feedback on generation failure** | Severity: High
      `handleToggleNarration` catch block calls `exitNarrationMode()` silently. `regenerateAction` errors are swallowed (unawaited promise). No toast, no error state.
      Agents: code-reviewer
      Files: `app/document/[id].tsx:205`, `app/document/[id].tsx:453`

- [ ] **HIGH: `updateJobProgress` is dead code** | Severity: Medium
      Never called anywhere. Job progress logic is duplicated inline in `completeSegment` and `failSegment` — three copies of the same logic.
      Agents: convex-reviewer
      File: `convex/audio/mutations.ts:55-83`

---

## MEDIUM Confidence Findings (Single Agent, High Conviction)

- [ ] **`deleteAllForDocument` unsafe under concurrent regeneration** | Severity: High
      Two rapid `regenerateForDocument` calls can interleave: second delete destroys freshly-created job/segments from first regeneration. No lock or active-job guard.
      Agent: convex-reviewer

- [ ] **Paragraph count divergence: `sanitizeMarkdown(content)` vs raw `content`** | Severity: High
      Frontend counts paragraphs from `sanitizeMarkdown(content)`, backend extracts from raw `content`. If sanitization alters double-newline structure, indices misalign.
      Agent: code-reviewer

- [ ] **`getMostRecentCreation` fragility** | Severity: Medium
      Relies on `paragraphIndex` descending == most recently created, which breaks if insertion order changes. Should use job `createdAt` instead.
      Agent: convex-reviewer

- [ ] **Memory leak: playback status listener not explicitly removed** | Severity: Medium
      `player.addListener('playbackStatusUpdate', ...)` is never removed before `player.remove()`. If `expo-audio` doesn't clean up listeners on `remove()`, phantom callbacks can fire.
      Agent: code-reviewer

- [ ] **`getSegments` resolves storage URLs for ALL segments** | Severity: Medium
      50-paragraph document = 50 `ctx.storage.getUrl()` calls in a single query. May approach Convex query timeout for large documents.
      Agent: convex-reviewer

- [ ] **`skipNext` enabled when `activeParagraphIndex === -1`** | Severity: Low
      Forward skip button is active before playback starts. Tapping it jumps to paragraph 0, which is correct but inconsistent UX.
      Agent: code-reviewer

- [ ] **Duration calculation assumes CBR 128kbps** | Severity: Low
      ElevenLabs may use VBR. Progress bar time display could be inaccurate.
      Agents: convex-reviewer, code-reviewer

- [ ] **Dead code: speed pill ternary** | Severity: Low
      Both branches of the ternary at `NarrationControlBar.tsx:222-224` produce identical output.
      Agent: code-reviewer

---

## Agent Contradictions & Debates

| Topic | convex-reviewer | code-reviewer | Assessment |
|-------|----------------|---------------|------------|
| Race on job counter increment | Flagged as critical race condition, then self-corrected noting Convex OCC may retry | Not flagged | Convex OCC does retry on read-write conflicts for same document — severity is LOW, not CRITICAL. OCC handles this. |
| Storage delete atomicity | Flagged: storage.delete is not transactional with DB | Not examined | Valid concern — storage ops don't roll back with DB transaction. But deletion is rare (only on regenerate). LOW practical risk. |

---

## Recommendations by Priority

### P0 — Fix Before Ship
1. **Remove premature `onAllReady()` from `handleToggleNarration`** — Let the `useEffect` on segments handle state transitions
2. **Transition jobs to `"running"` in `markGenerating`** — Unblocks the stuck-detection cron
3. **Decrement `failedSegments` in `resetSegmentForRetry`** — Prevents counter corruption
4. **Add loading guard to `handleToggleNarration`** — Prevents double-toggle state corruption

### P1 — Fix Soon
5. Fix `createSegments` idempotency to compare hashes/counts, not just existence
6. Compare `completedCount` against `audioJob.totalSegments` instead of `segments.length`
7. Add error feedback (toast/alert) for generation and regeneration failures
8. Delete dead `updateJobProgress` mutation

### P2 — Improve Later
9. Add `regenerateForDocument` concurrency guard (check for active job before deleting)
10. Verify `sanitizeMarkdown` preserves paragraph structure or use raw content for counting
11. Paginate or lazy-load storage URLs in `getSegments`
12. Add accessibility state props to narration controls
13. Fix dead code speed pill ternary

---

## Metadata
- **Agents**: convex-reviewer (Glob, Grep, Read, Bash), code-reviewer (Read, Glob, Grep, WebSearch)
- **Confidence Framework**: HIGH (both agents agree), MEDIUM (single agent, high conviction), LOW (single agent, uncertain)
- **Report Generated**: 2026-03-23
- **Duration**: ~4m 30s combined
- **Next Steps**: Remediate P0 findings, then P1
