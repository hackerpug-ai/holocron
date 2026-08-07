---
sequence: 30
timeline: Phase 7 — Cutover and Decommission
status: In Progress
planned_from_roadmap_sha: 6eb1ae5b1a12963afe1792b500d67de962768d5581e79f2739cedb5e35c40465
planned_from_source_sha: 6de957d39d03577912f5aa5e4d35bf6049118b8f
source_kind: git-head
planned_at: 2026-08-02T04:51:01Z
capability_coverage: [CAP-CUT-01]
---

# Sprint 30: Cutover Rollback Drill and Data-Plane Point of No Return

**Sequence:** 30
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** In Progress
> Progress: Seventh closeout blockers **fixed** — disposable-only C-3 DB + exact dual triggers + package-bound C-3 OIDs; C-2 HEAD lock bind + v5 OID-mismatch negative; M-3 fail-closed identity tree · gate `20260807T105804Z` **5/5 verified:true** package=`f033bc86` · **not release-approved** · updated 2026-08-07T11:00:00Z
> Status-Note: Ninth residuals RH-S30-33/34/35 implemented. Fresh package `20260807T115948Z` (source/git_sha/sourceRevision `c084ed31`, package `39c08627`, lock tip `b6734dd3`) with exact C-3 trigger-set, production-path M-3 RED, C-2 executable-HEAD coverage. Sprint stays **In Progress**. No complete/release claim.
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-30`)
**Branch:** `mk6-rollback`
**PR:** —

> Depends on Sprint 29 (the cutover itself). Sprint 30 is the *insurance policy* on that cutover: it proves the escape hatch works while it still exists, then deliberately closes it.

## Overview

Sprint 30 implements **UC-SYNC-04 (Rollback plan)** — the only sprint in the migration whose job is to prove the migration can be *undone*, and then to record the exact moment it no longer can.

The cutover (Sprint 29) leaves production in a **read-only soak**: the app and all 44 MCP tools serve reads from Postgres, every production write path returns `migration_read_only`, and Convex is still alive holding the frozen pre-export state. That soak is the entire rollback window. Sprint 30 does three things inside it:

1. **Keep the escape hatch real** (D07-02) — the Convex cloud deployment stays live and un-deleted for the whole soak, and a Convex-pointing app build is *pinned* and provably bootable. An escape hatch nobody has ever opened is not an escape hatch.
2. **Open the hatch once, on purpose** (D07-01, D07-03) — trigger a seeded Sev-1 gate failure, re-point the data plane to frozen Convex via config, and prove **zero accepted post-export production writes were lost**.
3. **Close the hatch, permanently and immutably** (D07-04) — enable the first Postgres production write, record it as the **data-plane point of no return (PONR)** in an append-only ledger, and make every subsequent rollback attempt fail closed. After the PONR, recovery means restore-from-backup (CAP-BAK-01, Sprints 27–28), never "roll back to Convex."

**What the PRD requires** (`08-uc-sync.md` §UC-SYNC-04, AC-1..AC-3; `11-e2e-testing-criteria.md` T-SYNC-012/013/014 — all three are **human-gate** tier):

- **T-SYNC-012 / AC-1** — Convex deployment un-deleted through the soak; fallback build pinned; all production writes blocked.
- **T-SYNC-013 / AC-2** — representative app, MCP, upload, scheduled-job and mission-commit writes visibly block with `migration_read_only`; config re-point to frozen Convex succeeds with **zero accepted post-export production writes**.
- **T-SYNC-014 / AC-3** — the first accepted Postgres production write records the data-plane PONR; Convex *deletion* is a distinct, later source-destruction step gated on recovery evidence (Sprint 31).

### What already exists at the planning SHA (`6de957d3`)

Sprint 29 and its remediation rounds built most of the rollback *mechanism* — this sprint builds the **drill, the proof, and the PONR**:

- `services/platform/src/cutover/rollback-repoint.ts` (827 lines) — `runRollbackRepoint()`, post-export write audit (`loadPostExportWriteAudit`, `countAcceptedPostExportWrites`), export-watermark binding, live serving acknowledgements (`filterAuthorizingRollbackAcks`), durable `HOLO_DATA_PLANE=convex` control-plane write, and the fail-closed error codes `POST_EXPORT_WRITE_ACCEPTED` / `ROLLBACK_INELIGIBLE` / `EXPORT_WATERMARK_MISSING` / `LIVE_ACK_MISSING` / `CONTROL_PLANE_WRITE_FAILED`.
- `services/platform/src/cutover/soak-fence.ts` (3416 lines) — the `migration_read_only` fence (HTTP middleware, MCP tool guard, job/mission guards), durable data-plane read/write (`readDurableDataPlane`, `writeDurableDataPlane`, `resolveObservedDataPlane`), and the soak verification surfaces.
- `convex-fence-client.ts`, `export-watermark.ts`, `go-no-go.ts`, `etl-orchestrate.ts`, `article-baseline.ts`.
- CLI verbs: `cutover:{go-no-go,freeze,quiet-check,capture-article-baseline,verify-article,run-etl,flip,rollback-repoint,verify-tools,verify-reads,verify-soak}`.
- Migrations through `0029_backup_heartbeat.sql`.

### What does NOT exist — the actual build surface of this sprint

- **No PONR machinery at all.** `grep -rn "ponr\|point_of_no_return\|pointOfNoReturn"` over `services/platform/src` and the test tree returns **zero hits**. There is no write-enablement verb, no immutable PONR record, no migration creating a PONR ledger table, and nothing that makes `cutover:rollback-repoint` refuse *because* the PONR has passed. Today `runRollbackRepoint` fails only on accepted post-export writes — the PONR is a *distinct, stronger, irreversible* latch.
- **No rollback drill.** `rollback-repoint.ts` is a mechanism with unit/integration coverage; there is no orchestrated drill that seeds a Sev-1 gate failure, drives the re-point end to end, and independently recomputes zero-loss from raw audit evidence.
- **No Convex-live attestation or pinned fallback build.** Nothing asserts the Convex deployment is still reachable and un-deleted through the soak window, and no pinned Convex-pointing app build artifact exists or is proven bootable.
- **No security review** of the rollback config switch (who can flip the data plane, and can it be flipped back after PONR) or of PONR record immutability.

### The gate is one un-fakeable operator outcome

An operator triggering rollback during the read-only soak gets the data plane re-pointed to frozen Convex with **zero accepted post-export production writes lost** — and then, after the first accepted Postgres production write, the *same* rollback command is **rejected**. The negative control is the inverse and must fail the gate: a rollback that "succeeds" while accepted post-export writes exist, a PONR record that can be edited or deleted, or a rollback that still succeeds after the PONR.

> **Dependency caveat (advisory, non-blocking).** Sprint 30 was expanded via explicit `--sprint 30` selection. At planning time **Sprint 29 is not green** — its `SPRINT.md` records `status: Blocked` after the final independent red-hat at `6de957d3` (1 CRITICAL, 4 HIGH; max remediation cycle reached, no QA pass), while the roadmap table still shows 🟠 In flight. Sprint 30's drill runs *inside* the Sprint 29 soak, so several of these tasks cannot reach a real GREEN until the Sprint 29 fence/drain/rollback remediations land. Tasks are written to **fail closed** against that state rather than to assume it. If the Sprint 29 fence or `rollback-repoint` contract changes shape, re-run `/kb-sprint-tasks-plan 30 --only D07-01,D07-03 --overwrite`.

## Human Testing Gate

**Gate:** An operator triggering rollback during the read-only soak gets the data plane re-pointed to frozen Convex, with zero accepted post-export production writes lost.

**Dispatcher (required):** `bun services/platform/src/cli/holo.ts` — never a PATH `holo` stub.

**Evidence rule:** every step is a real CLI action against real services plus a conjunctive multi-field oracle. A jq peek at pre-baked `.tmp` JSON is not a pass; a wholesale test-suite invocation (`pnpm test`, `vitest run`, `pytest`) is **not** a human-gate verification.

## Human Test Deliverable

**Test Steps:**

1. Trigger a seeded Sev-1 gate failure during soak — rollback re-points config to frozen Convex.
2. Count accepted post-export production writes after rollback — exactly zero lost.
3. Confirm the pinned Convex-pointing app build still boots — fallback path works end-to-end.
4. Enable the first Postgres production write — event logs immutably as the data-plane PONR.
5. Attempt a config rollback after the PONR write — rejected, rollback path is closed.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D07-01 | RED: rollback recovers zero-loss, PONR write closes rollback path | red-test-generator | 75 min |
| D07-02 | Keep Convex live + pin the Convex-pointing fallback app build through soak | devops-engineer | 90 min |
| D07-03 | Run the rollback drill — Sev-1 trigger, config re-point, zero-loss verification | devops-engineer | 120 min |
| D07-04 | Record the data-plane point of no return (first accepted Postgres write) | devops-engineer | 90 min |
| D07-05 | Security review: rollback config switch + PONR immutability | security-reviewer | 60 min |

## Independent Red-Hat Remediation (RH-S30)

First independent review: `.spec/reviews/red-hat-sprint-30-20260807T074619Z-independent.md` → cycle **REDHAT-FIX-RH-S30-01..08** (implemented on main; second review found residual defects).

### Second Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T085706Z-independent-remediation.md` (reviewed SHA `2ff0e6c4`, verdict **NEEDS REVISION**).

| ID | Finding | Required remediation | Severity |
|----|---------|----------------------|----------|
| REDHAT-FIX-RH-S30-09 | C-1 | Close every pre-PONR post-fence-lift failure window (accepted-document/non-201, lost/invalid responses); re-arm fence + durable refuse/audit. | CRITICAL |
| REDHAT-FIX-RH-S30-10 | C-2 | Commit gate results, raw verifier output, evidence, remediation status, and source changes atomically so the reviewed SHA contains the evidence it claims. | CRITICAL |
| REDHAT-FIX-RH-S30-11 | H-1 | Add authorization to `recordFenceArmed`; prevent forged fence prerequisites from enabling writes. | HIGH |
| REDHAT-FIX-RH-S30-12 | H-2 | Add authorization boundaries to irreversible enable-writes and rollback-repoint CLI paths. | HIGH |
| REDHAT-FIX-RH-S30-13 | H-3 | Close or explicitly audit the owner-DDL trigger-disable escape; prove PONR protection under the real operator role model. | HIGH |
| REDHAT-FIX-RH-S30-14 | H-4 | Implement and invoke `assert-human-test-verdict` in the gate; capture exit/stdout; bind to raw verifier result. | HIGH |
| REDHAT-FIX-RH-S30-15 | M-1 | Finalize gate `meta.json` to a durable completed/pass (or failed) state after execution. | MEDIUM |
| REDHAT-FIX-RH-S30-16 | M-2 + L-1 | Preserve pinned fallback commit identity in step-3 summary; document verifier scope vs external-state attestation. | MEDIUM/LOW |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-09.md` … `REDHAT-FIX-RH-S30-16.md`

### Third Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T092237Z-independent-closeout.md` (reviewed SHA `25db7f9e`, verdict **NEEDS REVISION** — 2 CRITICAL + 1 MEDIUM).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-17 | C-2 re-opened | Fail-closed Git-tree containment: `git_sha` must name an evidence-containing commit (C-2-atomic-v2 fixed-point package); assert rejects non-containing `09aae0dd` bind; fresh gate package. | CRITICAL | `devops-engineer` |
| REDHAT-FIX-RH-S30-18 | C-3 (H-3 re-opened) | Rewrite role-provenance probe: non-owner preflight before any DDL/DML; non-mutating or guaranteed-rollback; production-role SQLSTATE gate/IT-owned; never destroy PONR latch. | CRITICAL | `security-auditor` |
| REDHAT-FIX-RH-S30-19 | M-3 | PLATFORM_IT oracles for all three `injectFirstWriteFailure` kinds (`non_201_accepted_id`, `transport_error`, `reselect_miss`) asserting fence re-arm + rollback refuse. | MEDIUM | `mastra-planner` |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-17.md`
- `REDHAT-FIX-RH-S30-18.md`
- `REDHAT-FIX-RH-S30-19.md`

**Specialist set (this cycle):** `devops-engineer` (C-2), `security-auditor` (C-3), `mastra-planner` (M-3). Orchestrator consolidated; it authored no task content.

**Topological order (advisory):** RH-S30-18 (safe probe) can land independently of RH-S30-19; RH-S30-17 (containment + fresh gate package) should consume a tip that already has 18/19 when re-running the human gate so evidence is complete. RH-S30-19 is pure IT and may parallelize with 18.

### Fourth Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md` (reviewed SHA `a0edfdd`, verdict **NEEDS REVISION** — 2 CRITICAL + 1 MEDIUM).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-20 | C-2 residual | Non-self-referential attestation + blob-identity assert (load named-commit blob; require OID/field identity; C-2-atomic-v3). Path-only `cat-file -e` insufficient. Fresh gate package. | CRITICAL | `devops-engineer` |
| REDHAT-FIX-RH-S30-21 | C-3 residual | Delete destructive marker-parse fallback; hard-fail parse miss with zero extra DML; forced-miss negative test on PONR-holding disposable DB proves rows+triggers preserved; gate/IT owns branch. | CRITICAL | `security-auditor` |
| REDHAT-FIX-RH-S30-22 | M-3 residual | PLATFORM_IT identity oracles for all three injectFirstWriteFailure kinds (accepted_writes[].id / write_row_id equality — not merely count≥1); prefer reselect_miss audits real HTTP 201 id. | MEDIUM | `mastra-planner` |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-20.md`
- `REDHAT-FIX-RH-S30-21.md`
- `REDHAT-FIX-RH-S30-22.md`

**Specialist set (this cycle):** `devops-engineer` (C-2), `security-auditor` (C-3), `mastra-planner` (M-3). Orchestrator consolidated; it authored no task content.

**Topological order (advisory):** RH-S30-21 (safe parse-miss) can land independently of RH-S30-22; RH-S30-20 (blob-identity + fresh gate package) should consume a tip that already has 21/22 when re-running the human gate so evidence is complete. RH-S30-22 is pure IT and may parallelize with 21.


### Ninth Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md` (reviewed SHA `9151324a`, package `20260807T113518Z` / P1 `47dffa31`, verdict **NEEDS REVISION** — 1 CRITICAL + 2 HIGH).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-33 | C-3 residual | Exact two-trigger set oracle (no duplicates/extras) in producer+gate+package+assert; bind raw `disable-<trigger>/exit.code` + complementary D/O stderr; negative mutation×2 fixture; fresh package; implementer branch + merge only after APPROVED | HIGH | `security-auditor` |
| REDHAT-FIX-RH-S30-34 | M-3 residual | Production-path RED/mutation capture requires real vitest (`command -v`); reject exit 127 / command-not-found; validate raw FAIL before metadata; controlled mutation of `runEnableWrites` / independentHttp201Id / reselect_miss; assert rejects 127 theatre | CRITICAL | `mastra-planner` |
| REDHAT-FIX-RH-S30-35 | C-2 residual | Executable-HEAD coverage: fail-closed post-source runtime-tree/allowlist (evidence/meta only); reject ancestor-only + lock retention as coverage; historical 113518Z cannot certify tip; fresh source-matching package with equal git_sha/source_sha_at_run/sourceRevision | HIGH | `devops-engineer` |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-33.md` — `security-auditor` → implementer `devops-engineer` · C-3 residual (exact-set + raw D/O bind) · HIGH · 6 AC / 10 TC · `red_first`
- `REDHAT-FIX-RH-S30-34.md` — `mastra-planner` → implementer `mastra-implementer` · M-3 residual (production-path vitest RED/mutation) · CRITICAL · 8 AC / 14 TC · `red_first`
- `REDHAT-FIX-RH-S30-35.md` — `devops-engineer` · C-2 residual (executable-HEAD / post-source allowlist Option A) · HIGH · 7 AC / 10 TC · `red_first`

**Specialist set (this cycle):** `security-auditor` (C-3), `mastra-planner` (M-3), `devops-engineer` (C-2). Dispatched in a single wave (`--max-agents 4`). Orchestrator consolidated; it authored no task content.

**Quality:** remediation FIX tasks with GWT ACs, TCs, anti-stub, evidence dirs, REQUIREMENT-CONTRACT v1 blocks, branch discipline. **Fakeability floor:** exact-set multiset (not len==2); real vitest + production-path mutation (not exit 127 theatre); real git post-source path delta (not ancestor-only).

**Topological order (advisory):** RH-S30-33 ∥ RH-S30-34 → RH-S30-35 (fresh source-matching gate package last so tip includes exact-set + honest M-3 RED under executable-HEAD coverage). All three require a final source-matching package for closeout; 35 is the coverage gate that makes that package tip-certifying.

**Branch / merge:** implementer task branches; unreviewed work NEVER merges; on dual-lens APPROVED, orchestrator merges via `kb-orchestrate` `references/merge-to-main.sh` (flock-serialized). Landing: `~/Projects/brain/tools/landing/assert-landed.sh` must exit 0 before goal complete.

### Ninth-round remediation task detail files

Generated by `/kb-sprint-tasks-plan` remediation cycle on 2026-08-07T12:15:00Z from eighth independent final closeout `red-hat-sprint-30-20260807T114032Z-eighth-independent-final-closeout.md` (reviewed SHA `9151324a`, NEEDS REVISION — 1 CRITICAL + 2 HIGH).

- `REDHAT-FIX-RH-S30-33.md` — `security-auditor` → `devops-engineer` · C-3 residual (exact two-trigger set + raw D/O) · HIGH · 6 AC / 10 TC · `red_first`
- `REDHAT-FIX-RH-S30-34.md` — `mastra-planner` → `mastra-implementer` · M-3 residual (production-path vitest RED/mutation) · CRITICAL · 8 AC / 14 TC · `red_first`
- `REDHAT-FIX-RH-S30-35.md` — `devops-engineer` · C-2 residual (executable-HEAD coverage Option A) · HIGH · 7 AC / 10 TC · `red_first`

## Source Coverage

- **UC-SYNC-04** — Rollback plan (`08-uc-sync.md` lines 56-64)
- **T-SYNC-012** — Convex live + pinned build through read-only soak (human-gate)
- **T-SYNC-013** — Read-only rollback preserves accepted data (human-gate)
- **T-SYNC-014** — Data-plane and source-destruction points are distinct (human-gate)

## Capability Coverage

- **CAP-CUT-01** — config-reversible rollback during read-only soak + the immutable data-plane point-of-no-return record (`10-technical-requirements/09-capability-chains.md` lines 22-31)

## Blocks

- **Blocks:** Sprint 31 (Convex Decommission — deletion is only permitted after this sprint proves the recovery path and records the PONR)
- **Dependent on:** Sprint 29 (Cutover — Write Freeze, ETL and Read-Only Soak Flip)

## Task Detail Files

Generated by `/kb-sprint-tasks-plan 30` on 2026-08-02T06:20:00Z.

### Third-round remediation task detail files

Generated by `/kb-sprint-tasks-plan` remediation cycle on 2026-08-07T09:30:27Z from closeout review `red-hat-sprint-30-20260807T092237Z-independent-closeout.md`.

- `REDHAT-FIX-RH-S30-17.md` — `devops-engineer` · C-2 re-open · CRITICAL
- `REDHAT-FIX-RH-S30-18.md` — `security-auditor` → implementer `devops-engineer` · C-3 · CRITICAL
- `REDHAT-FIX-RH-S30-19.md` — `mastra-planner` → implementer `mastra-implementer` · M-3 · MEDIUM

Dispatched specialist set (wave-sequenced, `--max-agents 4`): `mastra-planner`, `devops-engineer`, `convex-planner`, `react-native-ui-planner` (wave 1) → `security-auditor` (wave 2). The orchestrator consolidated; it authored no task content.

### Fourth-round remediation task detail files

Generated by `/kb-sprint-tasks-plan` remediation cycle on 2026-08-07T10:01:05Z from independent final closeout `red-hat-sprint-30-20260807T094841Z-independent-final-closeout.md` (reviewed SHA `a0edfdd`, NEEDS REVISION — 2 CRITICAL + 1 MEDIUM).

- `REDHAT-FIX-RH-S30-20.md` — `devops-engineer` · C-2 residual (blob-identity / C-2-atomic-v3) · CRITICAL
- `REDHAT-FIX-RH-S30-21.md` — `security-auditor` → implementer `devops-engineer` · C-3 residual (marker-miss hard-fail + preservation) · CRITICAL
- `REDHAT-FIX-RH-S30-22.md` — `mastra-planner` → implementer `mastra-implementer` · M-3 residual (write-row identity oracles) · MEDIUM

Dispatched specialist set (wave-sequenced, `--max-agents 4`): `devops-engineer`, `security-auditor`, `mastra-planner` (single wave). The orchestrator consolidated; it authored no task content.

**Quality:** remediation FIX tasks with GWT ACs, TCs, anti-stub, evidence dirs, REQUIREMENT-CONTRACT v1 blocks. **Fakeability floor:** behavioral ACs require real git oracles (C-2), real disposable Postgres (C-3/M-3), and identity equality (M-3) — count-only / path-only / success-path-only evidence rejected.

**Topological order:** RH-S30-21 ∥ RH-S30-22 → RH-S30-20 (fresh gate package last so tip includes probe + IT fixes).

### Fifth Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T101142Z-independent-final-closeout.md` (reviewed SHA `fe79d37`, verdict **NEEDS REVISION** — residual after RH-S30-20..22 implementation path).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-23 | C-2 residual | Reject E1-vs-bind-tip; immutable commit+blob-OID attestation (C-2-atomic-v4) | CRITICAL | `devops-engineer` |
| REDHAT-FIX-RH-S30-24 | C-3 residual | Gate-owned seeded forced-marker-miss; reject empty-table false-green | CRITICAL | `security-auditor` |
| REDHAT-FIX-RH-S30-25 | M-3 residual | Independent HTTP-201 ID capture + durable per-branch identity evidence | MEDIUM | `mastra-planner` |

Task plan files:

- `REDHAT-FIX-RH-S30-23.md`
- `REDHAT-FIX-RH-S30-24.md`
- `REDHAT-FIX-RH-S30-25.md`

**Specialist set:** `devops-engineer` (C-2), `security-auditor` (C-3), `mastra-planner` (M-3). Orchestrator consolidated; it authored no task content.

**Note:** Implementation path through package `20260807T102120Z` closed the narrow blob-identity / seed-required / independent-capture classes. Independent final closeout `20260807T102743Z` found **new residual** classes tracked in the sixth cycle below.

### Sixth Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md` (reviewed SHA `5b86e4e`, package `20260807T102120Z` / `b9b30e91`, verdict **NEEDS REVISION** — 2 HIGH + 1 MEDIUM).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-26 | C-2 residual | Git-object-bound attestation sidecar; required protocol/run_id/source; fail closed (C-2-atomic-v5) | HIGH | `devops-engineer` |
| REDHAT-FIX-RH-S30-27 | C-3 residual | Bind forced-marker-miss + non-owner + named triggers to gate status/exit/package assert; mandatory disposable DB | HIGH | `security-auditor` |
| REDHAT-FIX-RH-S30-28 | M-3 residual | Package-bound durable RED/GREEN per-branch identity evidence (not `.tmp`-only) | MEDIUM | `mastra-planner` |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-26.md` — `devops-engineer` · C-2 residual (attestation Git-bound / C-2-atomic-v5) · HIGH
- `REDHAT-FIX-RH-S30-27.md` — `security-auditor` → implementer `devops-engineer` · C-3 residual (status/exit/assert binding) · HIGH
- `REDHAT-FIX-RH-S30-28.md` — `mastra-planner` → implementer `mastra-implementer` · M-3 residual (package-bound evidence) · MEDIUM

**Specialist set (this cycle):** `devops-engineer` (C-2), `security-auditor` (C-3), `mastra-planner` (M-3). Dispatched in a single wave (`--max-agents 4`). Orchestrator consolidated; it authored no task content.

**Quality:** remediation FIX tasks with GWT ACs, TCs, anti-stub, evidence dirs, REQUIREMENT-CONTRACT v1 blocks. **Fakeability floor:** real git oracles (C-2), real disposable Postgres (C-3), real PLATFORM_IT suite emission + package bind (M-3) — worktree-sidecar / metadata-only C-3 / `.tmp`-only evidence rejected.

**Topological order:** RH-S30-27 ∥ RH-S30-28 → RH-S30-26 (fresh gate package last so tip includes C-3 predicates + M-3 identity tree under corrected attestation lock).

### Sixth-round remediation task detail files

Generated by `/kb-sprint-tasks-plan` remediation cycle on 2026-08-07T10:50:00Z from independent final closeout `red-hat-sprint-30-20260807T102743Z-independent-final-closeout.md` (reviewed SHA `5b86e4e`, NEEDS REVISION — 2 HIGH + 1 MEDIUM).

- `REDHAT-FIX-RH-S30-26.md` — `devops-engineer` · C-2 residual (Git-bound attestation / C-2-atomic-v5) · HIGH · 7 AC / 12 TC · `red_first`
- `REDHAT-FIX-RH-S30-27.md` — `security-auditor` → `devops-engineer` · C-3 residual (status/exit/assert binding) · HIGH · 6 AC / 14 TC · `red_first`
- `REDHAT-FIX-RH-S30-28.md` — `mastra-planner` → `mastra-implementer` · M-3 residual (package-bound durable evidence) · MEDIUM · 7 AC / 16 TC · `red_first`

### Seventh Red-Hat Remediation Cycle (plan only — do not treat as fixed until dual-lens APPROVED + landed)

**Source:** `.spec/reviews/red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md` (reviewed SHA `fda9b9da`, package `20260807T103459Z` / `dd45328e`, verdict **NEEDS REVISION** — 1 CRITICAL + 4 HIGH; M-3 MEDIUM residual).

| ID | Finding | Required remediation | Severity | Proposed by |
|----|---------|----------------------|----------|-------------|
| REDHAT-FIX-RH-S30-29 | C-2 residual | `ASSERT_PACKAGE_HEAD` binds HEAD lock blob OID (not path-only); package safe-resets `ASSERT_LOCK_COMMIT`; disposable v5 E1-vs-bind negative reaches `hist_oid≠sub_oid` | HIGH | `devops-engineer` |
| REDHAT-FIX-RH-S30-30 | C-3 residual | Explicit distinct disposable marker DB (reject prod/cutover + equality); exact two trigger names `tgenabled=O`; bind C-3 report blobs to package object + attestation `c3-*` | CRITICAL / HIGH | `security-auditor` |
| REDHAT-FIX-RH-S30-31 | M-3 residual | Fail-closed `m3-identity` with committed/package-bound RED + GREEN + mutation + manifest + `assert-m3-identity-evidence.sh` | MEDIUM | `mastra-planner` |

Task plan files (durable ACs + evidence requirements; **no implementation in this plan commit**):

- `REDHAT-FIX-RH-S30-29.md` — `devops-engineer` · C-2 residual (HEAD-lock OID bind + v5 E1-vs-bind oracle-reach) · HIGH · 7 AC / 10 TC · `red_first`
- `REDHAT-FIX-RH-S30-30.md` — `security-auditor` → implementer `devops-engineer` · C-3 residual (disposable DB + exact dual triggers + package-bound C-3 blobs) · CRITICAL/HIGH · 6 AC / 16 TC · `red_first`
- `REDHAT-FIX-RH-S30-31.md` — `mastra-planner` → implementer `mastra-implementer` · M-3 residual (fail-closed m3-identity RED/GREEN/mutation) · MEDIUM · 8 AC / 19 TC · `red_first`

**Specialist set (this cycle):** `devops-engineer` (C-2), `security-auditor` (C-3), `mastra-planner` (M-3). Dispatched in a single wave (`--max-agents 4`). Orchestrator consolidated; it authored no task content.

**Quality:** remediation FIX tasks with GWT ACs, TCs, anti-stub, evidence dirs, REQUIREMENT-CONTRACT v1 blocks. **Fakeability floor:** real git oracles (C-2), real disposable Postgres (C-3), real PLATFORM_IT suite emission + package bind (M-3) — path-only HEAD lock / count≥1 triggers / worktree-only C-3 / `.tmp`-only M-3 evidence rejected.

**Topological order:** RH-S30-30 ∥ RH-S30-31 → RH-S30-29 (fresh gate package last so tip includes C-3 package-bound blobs + M-3 identity tree under corrected HEAD-lock + v5 E1-vs-bind controls).

### Seventh-round remediation task detail files

Generated by `/kb-sprint-tasks-plan` remediation cycle on 2026-08-07T11:05:00Z from independent final closeout `red-hat-sprint-30-20260807T105114Z-independent-final-closeout.md` (reviewed SHA `fda9b9da`, NEEDS REVISION — 1 CRITICAL + 4 HIGH).

- `REDHAT-FIX-RH-S30-29.md` — `devops-engineer` · C-2 residual (HEAD-lock OID + v5 E1-vs-bind) · HIGH · 7 AC / 10 TC · `red_first`
- `REDHAT-FIX-RH-S30-30.md` — `security-auditor` → `devops-engineer` · C-3 residual (disposable DB + exact triggers + package blobs) · CRITICAL/HIGH · 6 AC / 16 TC · `red_first`
- `REDHAT-FIX-RH-S30-31.md` — `mastra-planner` → `mastra-implementer` · M-3 residual (fail-closed m3-identity) · MEDIUM · 8 AC / 19 TC · `red_first`

- `D07-01-red-rollback-recovers-zero-loss-ponr-write-closes-rollback-path.md` — `mastra-planner` · 7 AC / 19 TC · `red_first`
- `D07-02-keep-convex-live-pin-the-convex-pointing-fallback-app-build-through-soak.md` — `devops-engineer` · 4 AC / 10 TC · `red_first`
- `D07-03-run-the-rollback-drill-sev-1-trigger-config-re-point-zero-loss-verification.md` — `devops-engineer` · 5 AC / 12 TC · `red_first`
- `D07-04-record-the-data-plane-point-of-no-return-first-accepted-postgres-write.md` — `mastra-planner` · 8 AC / 28 TC · `shared`
- `D07-05-security-review-rollback-config-switch-ponr-immutability.md` — `security-auditor` · 9 AC / 18 TC · `skipped`

**Quality:** avg **115/115** (min 80). **Fakeability audit:** `validate_scenario.py` exit 0 on **all 33 behavioral ACs** across all 5 tasks — zero CRITICAL, zero HIGH.

**Topological order:** D07-01 (RED oracles) → D07-02 (escape hatch made real) → D07-03 (drill) → D07-04 (PONR + latch) → D07-05 (security review, depends on D07-01/03/04).

### Cross-specialist findings folded into these tasks

Three defects in **already-shipped Sprint 29 code** were found during expansion and shape the ACs above:

1. **`runRollbackRepoint()` performs zero Convex I/O** (`rollback-repoint.ts:456-790`). It writes `HOLO_DATA_PLANE=convex` to durable secrets and collects acks from the platform's own Hono `/health`; `TARGET_CONVEX_FROZEN` is a label string, not a deployment URL. A rollback today would report `ok: true` against a **deleted** Convex deployment. → D07-02 adds the reachability + identity attestation.
2. **`HOLO_DATA_PLANE` has exactly one consumer** — `resolveObservedDataPlane()` at `http/health.ts:267`, echoed into the `/health` body. No read handler routes on it, so `/health` reporting `data_plane: 'convex'` is a self-referential echo of the value the same command just wrote. → D07-03 forbids that oracle and requires a content-bound Convex read.
3. **`loadPostExportWriteAudit()` is fail-open** (`rollback-repoint.ts:181-211`) — an absent ledger file synthesizes `{accepted_writes: []}`, so "zero data loss" is currently provable by deleting a file. → D07-03 treats an absent ledger as an error; D07-04's PONR latch is DB-backed and `.tmp`-tamper-proof.

Additionally, `security-auditor` found a gap in **this sprint's own D07-04 design**: migration 0030 specifies immutability as a `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger, and **PostgreSQL does not fire row-level triggers on TRUNCATE** — so `TRUNCATE TABLE data_plane_ponr` would erase the PONR while every UPDATE/DELETE probe reports the ledger immutable. D07-05 AC-8 probes it and records the outcome empirically rather than assuming either result.

### Advisory

Sprint 29 is **Blocked** (`status: Blocked`, 1 CRITICAL + 4 HIGH at the final red-hat). Sprint 30's drill runs *inside* the Sprint 29 soak, so several ACs here are written to **fail closed** against that state and cannot reach GREEN until the Sprint 29 fence/drain/rollback remediations land.

Estimates for D07-02 (90 min) and D07-03 (120 min) were flagged by `devops-engineer` as tight versus Sprint 29 precedent (comparable tasks ran 120–150 min). Left at the roadmap values per the stub-preservation rule rather than silently revised.
