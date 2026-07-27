---
sequence: 26
timeline: Phase 5 — Client Rewrite
status: In Progress
planned_from_roadmap_sha: 93eddd7c1916e03de0d7e3faafdaff41754c054c64d2cca4bfe12b6b411ff936
planned_from_source_sha: 1611c6d61d28ed6f2396efce4dd91a48ae9a8ceb
source_kind: git-head
planned_at: 2026-07-24T20:52:41Z
---

# Sprint 26: Image and Voice Upload Lifecycle Client

**Sequence:** 26
**Timeline:** Phase 5 — Client Rewrite
**Status:** In Progress
> Progress: 4/4 tasks completed · updated 2026-07-27T03:16:58Z
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-26`)
**Branch:** `mk6-uploads`
**PR:** —

## Overview

Sprint 26 is the **upload-lifecycle client** sprint — it wires the last two Convex-era client surfaces (image attach in the improvements sheet, and the voice session) onto the authoritative Hono content-addressed upload store, and removes the **final `convex/react` client dependency** in the process (CAP-CUT-01). It closes **T-DATA-021** (image and voice upload lifecycle is authoritative) and the upload authoring path of **CAP-SYNC-01**.

**What is already proven before this sprint.** Sprint 14 built the backend content-addressed upload store — `file_objects` (media group) **replaces Convex `_storage`**, keyed by a unique `content_hash` (`file_objects_content_hash_uidx` in `services/platform/src/db/schema/media.ts`), with the Hono lifecycle `POST /api/uploads` → `PUT /api/uploads/:id` → `POST /api/uploads/:id/finalize` (`services/platform/src/http/hono-app.ts:258-290` → `finalizeUploadIntent` in `services/platform/src/uploads/service.ts:439`) and the shared CAS upsert (`services/platform/src/blob/file-objects.ts`). `file_objects` is a `zero_pub` member (`services/platform/src/db/schema/zero-pub.ts:189`), so a finalized attachment reconciles reactively. Sprint 24 rewrote the app off Convex onto Zero/Hono and left the improvements attach surface (`components/improvements/ImprovementSubmitSheet.tsx`) and the voice session (`hooks/use-voice-session.ts` — which still throws `CONVEX_UNAVAILABLE` behind a `convex/react` guard at L39) to be wired to that lifecycle.

**What this sprint does.** It is a **client-side** sprint — it consumes the upload store that already exists; it does not rebuild the backend routes. (1) **S-UPLOAD-01** — an image upload lifecycle client in the improvements sheet (one state machine: idle/preview/uploading/success/error) that drives init→PUT→finalize, verifies SHA-256, attaches idempotently (one `file_objects` row per distinct hash), and leaves no orphan on failure. (2) **S-UPLOAD-02** — voice audio upload through the same lifecycle (`kind=voice_artifact`) **plus** rewiring the imperative Convex voice-session dispatcher to an authoritative Hono command (`POST /api/voice-sessions`), so a cancelled recording leaves zero orphan rows and `grep -rn 'convex/react'` over `app/ components/ hooks/ lib/` returns EMPTY (CAP-CUT-01). (3) **S-UPLOAD-03** — the deterministic verification harness T-DATA-021 needs: a Maestro `upload.yaml` journey driving the real flow end-to-end, and a real-Postgres `holo verify:blob --last` / `--orphans` helper (fail-closed). (4) **S-UPLOAD-04** — an adversarial reviewer pass running the 7-step T-DATA-021 human test, the no-convex gate, the idempotency/orphan-safety proofs, and a theme-token/testID audit.

The gate is one un-fakeable outcome: uploading the seeded `test-fixture.jpg` through the improvements sheet against real Hono and blob storage produces **exactly one `file_objects` row whose SHA-256 matches the fixture, with zero orphan rows**. The sprint owns two capability-chain segments: **CAP-SYNC-01** (authoritative image/voice upload via the Hono content-addressed lifecycle — hash-verified, idempotent, orphan-safe) and **CAP-CUT-01** (removes the last `convex/react` client dependency — the voice session dispatcher).

> **Dependency caveat (advisor, non-blocking).** Sprint 26 depends on Sprint 14 (✅ Completed — backend upload store) and Sprint 24 (🟠 In flight — RN rewrite onto Zero/Hono) for the improvements/voice client surfaces it consumes. This JIT expansion is planned against the current committed state (`1611c6d6`); if the Sprint 24 rewrite drifts on the `ImprovementSubmitSheet` attach seam or the `use-voice-session.ts` dispatcher shape, re-run `/kb-sprint-tasks-plan --sprint 26 --only S-UPLOAD-01,S-UPLOAD-02 --overwrite` to refresh those two tasks.

## Human Testing Gate

**Gate:** Uploading the seeded `test-fixture.jpg` through the improvements sheet against real Hono and blob storage produces exactly one `file_objects` row whose SHA-256 matches the fixture with zero orphan rows.

## Human Test Deliverable

1. Run `holo seed:e2e --reset` — clears `file_objects` in the nonproduction namespace.
2. Open the improvements sheet and attach the seeded `test-fixture.jpg` — the preview thumbnail appears.
3. Submit the report — upload-init, PUT, finalize complete and the sheet shows success.
4. Run `holo verify:blob --last` — exactly one `file_objects` row with SHA-256 matching the fixture.
5. Re-submit the identical image — the attach is idempotent, still one `file_objects` row.
6. Start then cancel a voice recording — `holo verify:blob --orphans` reports zero orphan rows.
7. Run the Maestro `upload.yaml` journey — passes and emits artifacts.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-UPLOAD-01 | Image upload lifecycle client (improvements) on content-addressed Hono | react-native-ui-implementer | 180 min |
| S-UPLOAD-02 | Voice audio upload + imperative dispatcher rewire off Convex | react-native-ui-implementer | 360 min |
| S-UPLOAD-03 | Maestro upload journey + blob verification helper | red-test-generator | 150 min |
| S-UPLOAD-04 | Reviewer pass: upload idempotency, orphan-safety, no-convex-final | react-native-ui-reviewer | 90 min |

## Source Coverage

- T-DATA-021, UC-SYNC-01
- `.spec/prds/mk6-migration/08-uc-sync.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/10-technical-requirements/04-api-design.md`
- `.spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md`
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md`
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-SYNC-01: authoritative image/voice upload via the Hono content-addressed lifecycle (hash-verified, idempotent, orphan-safe)
- CAP-CUT-01: removes the last `convex/react` client dependency (voice session dispatcher)

## Blocks

- Blocks: Sprint 29
- Depends on: Sprint 14, Sprint 24

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-24T20:52:41Z (specialist proposal: react-native-ui-planner; backend-contract enrichments: mastra-planner; design enrichments: frontend-designer). Avg quality **115/115**; fakeability audit **0 CRITICAL / 0 HIGH** — `validate_scenario.py` exit 0 on every behavioral AC of all 4 tasks. Topological order: S-UPLOAD-01 → S-UPLOAD-02 (02 consumes 01's upload lifecycle + owns the CAP-CUT-01 dispatcher rewire) → S-UPLOAD-03 (depends on 01+02; the Maestro journey + verify:blob harness) → S-UPLOAD-04 (review/closure gate over 01+02+03).

- S-UPLOAD-01-image-upload-lifecycle-client-improvements-on-content-addressed-hono.md
- S-UPLOAD-02-voice-audio-upload-imperative-dispatcher-rewire-off-convex.md
- S-UPLOAD-03-maestro-upload-journey-blob-verification-helper.md
- S-UPLOAD-04-reviewer-pass-upload-idempotency-orphan-safety-no-convex-final.md

### Gate-harness remediation (GATE-FIX) — generated by /kb-sprint-tasks-plan on 2026-07-27T02:00:00Z

Focused harness-only remediation after QA verdict `blocked` (`gate-results.blocked-20260727T012043Z.json`). Product lifecycle remains healthy; these tasks add **distinct** scoped Maestro drivers for human-gate steps 2, 3, 5, 6. `tdd_mode=skipped` (gate-driver/configuration) with `requires_seeded_evidence=true` retained. No production feature work. No separate maestro_native skill install (exit_and_log_regex + `maestro test` matches step 7).

- GATE-FIX-S26-01-step-2-scoped-maestro-attach-preview.md — step 2 attach+preview
- GATE-FIX-S26-02-step-3-scoped-maestro-submit-success.md — step 3 submit→success
- GATE-FIX-S26-03-step-5-scoped-maestro-idempotent-resubmit.md — step 5 idempotent re-submit
- GATE-FIX-S26-04-step-6-scoped-maestro-voice-cancel-orphans.md — step 6 voice cancel + orphans

**Boundary notes folded in at consolidation (mastra-planner contract findings):**
- The upload protocol is authoritative Hono commands, never optimistic Zero mutators: `POST /api/uploads` (idempotency key + declared `sha256`/`byteLength`/`mime`) → `PUT /api/uploads/:id` (stream) → `POST /api/uploads/:id/finalize` (verify hash+length, promote, atomically attach).
- Idempotency is the `content_hash` unique index: identical SHA-256 → one `file_objects` row; `finalize` replay is a no-op returning the same object id.
- Orphan-safety: a started-but-unfinalized upload must NOT promote a `file_objects` row; a cancelled voice recording never calls upload-init.
- `holo verify:blob --last` asserts exactly one `file_objects` row + prints its SHA-256 (vs the seeded fixture); `holo verify:blob --orphans` asserts zero staged-but-unfinalized rows; both read REAL Postgres and fail-closed (non-zero) on violation.
- CAP-CUT-01 proof: after S-UPLOAD-02, `bun services/platform/src/cli/holo.ts verify:no-convex-client` exits 0 and `grep -rn 'convex/react' app components hooks lib` is EMPTY.

**Design notes folded in at consolidation (frontend-designer):**
- The improvements attach surface is ONE sheet with states `idle → preview → uploading → success → error` (state mutations, never navigation); the success state MUST reflect a completed finalize, never a pre-emptive optimistic "done" (anti-stub).
- The voice surface (existing `VoiceMicButton` + `VoiceSessionOverlay`) is ONE view with states `idle → recording → cancelled`; cancel triggers an orphan-safe server abort before reverting to idle.
- No new design tokens (Sprint 24 established react-native-paper theme tokens); preview thumbnail uses standard `Image` with dimension extraction.
