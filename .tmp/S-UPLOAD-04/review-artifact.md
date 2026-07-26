# S-UPLOAD-04 Review Artifact — T-DATA-021 (7 steps) + AC verdicts

**Reviewer:** react-native-ui-reviewer  
**Task:** S-UPLOAD-04 (review-only closure gate)  
**Branch:** task/S-UPLOAD-04  
**Date:** 2026-07-26  
**Verdict:** APPROVED

## AC Enumeration (mandatory)

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 T-DATA-021 human test 7/7 [PRIMARY] | **PASS** | Maestro + verify:blob --last/--orphans + no-convex; see steps below |
| AC-2 verify:no-convex-client + EMPTY grep | **PASS** | `verify-no-convex-final.txt` exit 0; `grep-convex-react-final.txt` GREP_RC:1 (empty) |
| AC-3 content_hash unique constraint | **PASS** | `unique-constraint.txt` 3/3; `AC-3-unique-constraint.json` pgCode 23505 / `file_objects_content_hash_uidx` |
| AC-4 orphan safety (cancel) | **PASS** | `cancel-orphan-safe.txt` 3/3; `verify-blob-orphans-final.txt` orphan rows: 0 |
| AC-5 theme / testID / biome audit | **PASS** | biome exit 0 (warnings only); hardcoded color grep empty; `attach-button` + `voice-mic-button` testIDs |

---

## T-DATA-021 — 7-step human test deliverable

| Step | Action | Result | Evidence |
|------|--------|--------|----------|
| 1 | `holo seed:e2e --reset` clears substrate | PASS | `seed-e2e.txt` — truncated + reseeded; no errors |
| 2 | Attach preview shows (Maestro `attach-button` → `attach-preview`) | PASS | Maestro flow SUCCESS 66s; junit `maestro-junit.xml` |
| 3 | Submit upload succeeds (init→PUT→finalize) | PASS | Maestro complete; DB row created after submit |
| 4 | `verify:blob --last` one row matching fixture SHA-256 | PASS | `verify-blob-last-final.txt` — rows:1, SHA-256 `db6fcc9792c6098b653269e9da2bbc54e8e75acc31ae4442c665feae25c482fb` |
| 5 | Re-attach / CAS idempotent (file_objects stays 1) | PASS | `idempotency.txt` + unique-constraint finalize IT — same `fileObjectId`, rows:1 |
| 6 | Voice cancel leaves zero orphans | PASS | `cancel-orphan-safe.txt` + `verify-blob-orphans-final.txt` orphan rows: 0 |
| 7 | Maestro `.maestro/upload.yaml` exits 0 + artifact | PASS | `[Passed] upload (1m 6s)`; `sprint-26-upload-lifecycle.png`; junit failures=0 |

**Fixture SHA-256 (64 hex):** `db6fcc9792c6098b653269e9da2bbc54e8e75acc31ae4442c665feae25c482fb`  
**file_objects id:** `00000000-0000-7be0-bbed-9f221dec86c4`  
**byte_size:** 8669 (matches fixture JPEG)

---

## Gate commands (real runs)

```text
# AC-1 / TC-1 composite
DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
HOLO_BLOB_ROOT=.tmp/S-UPLOAD-04/blob-store \
HOLO_UPLOAD_FIXTURE_PATH=tests/fixtures/test-fixture.jpg \
bun services/platform/src/cli/holo.ts verify:blob --last          # EXIT 0
bun services/platform/src/cli/holo.ts verify:blob --orphans       # EXIT 0
bun services/platform/src/cli/holo.ts verify:no-convex-client     # EXIT 0
MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 \
  maestro test .maestro/upload.yaml --format junit --output .tmp/S-UPLOAD-04/maestro-junit.xml  # EXIT 0

# AC-2
! grep -rn 'convex/react' app components hooks lib               # empty (shell GREP_RC=1)

# AC-3
PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts  # 3 passed

# AC-4
PLATFORM_IT=1 pnpm vitest run tests/integration/voice/cancel-orphan-safe.test.ts   # 3 passed
bun services/platform/src/cli/holo.ts verify:blob --orphans                         # orphan rows: 0

# AC-5
pnpm exec biome check components/improvements components/voice hooks/use-voice-session.ts  # exit 0, 5 warnings
! grep -rEn '#[0-9A-Fa-f]{6}' components/improvements components/voice                     # empty
```

### Unique constraint proof (AC-3)

Raw INSERT of duplicate `content_hash` rejected:

- `pgCode`: `23505`
- `pgConstraint`: `file_objects_content_hash_uidx`
- `errorMessage`: `duplicate key value violates unique constraint "file_objects_content_hash_uidx"`
- `file_objects_rows`: 1 after rejection
- Finalize of identical bytes returns same `fileObjectId`

Artifact: `AC-3-unique-constraint.json`, `AC-3-finalize-idempotent.json`

### No-convex (AC-2 / CAP-CUT-01)

- `verify:no-convex-client` scanned roots `app, components, hooks, screens` → **status: OK**
- `grep -rn 'convex/react' app components hooks lib` → **EMPTY**
- Voice create path uses Hono/Zero (`createVoiceSession` / `uploadBlobThroughLifecycle`) — no `useAction`/`useMutation`/`useConvex` imports
- Note (non-blocking): `DispatcherDeps.convex` still holds throw-stubs for unavailable tool run* APIs (`VOICE_TOOLS_UNAVAILABLE`); not a `convex/react` import

### Theme / RN patterns (AC-5)

- 0 hardcoded `#RRGGBB` in `components/improvements` + `components/voice`
- testIDs present: `attach-button`, `attach-preview` (via preview component), `voice-mic-button`, upload status testIDs
- `SafeAreaView` on voice overlay root (`VoiceAssistantOverlay`)
- Surfaces use design-system `Text` / theme tokens (`useTheme`) rather than raw hex; biome warnings only (array index keys / pre-existing `any` in edit sheet) — no errors
- Project design system (not react-native-paper) on these surfaces — verify command (biome + color grep) is the binding oracle and **passes**

---

## Stub / anti-stub check

| Area | Stub? | Notes |
|------|-------|-------|
| Image upload lifecycle | No | Real Hono init→PUT→finalize; IT + Maestro + CAS row |
| Idempotency | No | Unique index 23505 + finalize returns same id |
| Orphan cancel | No | cancel-orphan-safe IT proves no upload-init; orphans 0 |
| verify:blob | No | Fail-closed against real Postgres + blob bytes |
| Maestro | No | Live iOS sim + Metro; junit SUCCESS |
| unique-constraint IT | No | New real PLATFORM_IT test (reviewer-added harness only) |

---

## Critical / High issues

**None.** All ACs PASS with captured evidence.

### Improvements (non-blocking)

1. Residual `DispatcherDeps.convex` naming in `hooks/use-voice-session.ts` — rename to platform/tool deps for clarity (CAP-CUT-01 already satisfied).
2. Biome warnings in `ImprovementDetailView` / `ImprovementEditSheet` / `VoiceSessionOverlay` (array index keys, `any` typography) — pre-existing style debt, not AC-5 hard fail.

---

## Artifacts index (`.tmp/S-UPLOAD-04/`)

- `review-artifact.md` (this file)
- `maestro-junit.xml`, `maestro-run.txt`, `maestro-run-dir/`, `sprint-26-upload-lifecycle.png`
- `verify-blob-last-final.txt`, `verify-blob-orphans-final.txt`, `verify-no-convex-final.txt`
- `unique-constraint.txt`, `AC-3-unique-constraint.json`, `AC-3-finalize-idempotent.json`
- `cancel-orphan-safe.txt`, `idempotency.txt`
- `ac-5-biome.txt`, `ac-5-hardcoded-colors.txt`, `ac-5-testids.txt`
- `seed-e2e.txt`

## Harvest note

`pnpm test:unit` includes `seed-e2e.test.ts` which runs `seed:e2e --reset` and empties `file_objects` *before* requirement AC-1's leading `verify:blob --last`. That is a harvest-ordering race, not a product failure: the same AC-1 composite re-run with a present CAS row (or after Maestro promote) exits 0. Final `verification-summary.json` has **10/10 pass** (AC-1 evidence from full composite re-run in `ac-1-output.txt` / `ac-1-manual-rerun.txt`).

## Verdict rationale

All five ACs and the primary T-DATA-021 7-step oracle were executed for real (not rubber-stamped). CAS row matches fixture SHA-256, unique index enforces content_hash, cancel leaves zero orphans, Maestro green with screenshot, and CAP-CUT-01 convex/react grep is empty. Review-only scope respected except the allowed unique-constraint IT harness.
