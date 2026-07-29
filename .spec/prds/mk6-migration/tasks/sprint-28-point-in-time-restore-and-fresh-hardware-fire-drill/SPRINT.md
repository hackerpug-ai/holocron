---
sequence: 28
timeline: Phase 6 — Standing Backup and Disaster Recovery
status: In Progress
planned_from_roadmap_sha: 95b4657a2d19ffcbd9c0208f4c9aef433c77782cda63a816635c606080f275ae
planned_from_source_sha: 2c3778c231e21001b4c6095ec9c406f01f94e4ff
source_kind: git-head
planned_at: 2026-07-28T01:16:22Z
---

# Sprint 28: Point-in-Time Restore and Fresh-Hardware Fire Drill

**Sequence:** 28
**Timeline:** Phase 6 — Standing Backup and Disaster Recovery
**Status:** In Progress
> Progress: implementation landed; final 6/6 human-gate closeout blocked · updated 2026-07-29
> Status-Note: Residual **DEPENDENCY-S28-R2-RO** (distinct live `R2_RESTORE_*` credentials absent) blocks final 6/6 closeout until credentials + fresh SHA-bound QA. Unbound `20260729T031355Z` gate-results archived; active `gate-results.json` withheld for next independent QA.
**Proposed by:** devops-engineer
**Milestone:** — (`sprint-28`)
**Branch:** `mk6-restore-drill`
**PR:** —

## Overview

Sprint 28 is the **point-in-time restore and fresh-hardware fire drill** sprint — it completes the *restore* half of **CAP-BAK-01** by proving that the off-mini backups stood up in Sprint 27 can actually bring a dead mini back to life, with **zero access to the original machine**. Sprint 27 built the *write* side (continuous WAL archiving + scheduled base backups via pgBackRest → R2, a restic blob mirror, the `backup_heartbeat` table, and failure/overdue alerting). Sprint 28 proves the *read* side: an operator restores Postgres + blob storage from the R2 bucket **alone** onto a freshly provisioned machine and gets a queryable database whose **row counts plus evidence-ledger chain match the pre-failure snapshot**. It gates the final Convex decommission (Sprint 31), not the feature build — T-PLAT-031's decommission explicitly re-runs this fire drill as its final pre-deletion gate.

**What is already proven before this sprint.** Sprint 04 provisioned Postgres 18 (`wal_level=logical`, the `zero_pub` publication, ~55 domain tables) and the `file_objects` content-addressed blob store (`services/platform/src/blob/`). Sprint 06 stood up the headless mini deployment: the four launchd plists, the `holo` stack CLI (`services/platform/src/cli/holo.ts` — `stack:up|down|status`, `db:*`, `namespace reset`, `verify:no-convex-client`), and the consolidated secrets store. Sprint 07 established the immutable bi-temporal evidence ledger — `beliefs`/`sources`/`passages`/`claims` with `tx_from`/`tx_to` validity windows (schema at `services/platform/src/db/schema/evidence.ts`) — whose as-of chain is the integrity oracle a restore must match. Sprint 14 built the content-addressed BlobStore (`services/platform/src/blob/{store,file-objects,utils,verify}.ts`) with SHA-256/byte-length/MIME parity.

**What this sprint consumes from Sprint 27 (input dependency).** The standing backup pipeline Sprint 27 stands up — an encrypted Cloudflare R2 bucket + scoped credentials + pgBackRest repo config (D04-02), continuous WAL archiving + scheduled base backups with zero continuity gaps (D04-03), a scheduled restic blob mirror with SHA-256 parity (D04-04), and failure/overdue alerting over a `backup_heartbeat` table (D04-05). **None of this exists in the current committed tree** (`services/platform/src/backup/` is absent at `2c3778c2`); Sprint 28 is JIT-planned against that state and assumes the Sprint 27 backup module lands before Sprint 28 executes.

**What this sprint does.** (1) **D05-01** — the RED integration test that *proves* the gate: a restore pointed at an empty/corrupted backup chain MUST fail closed, never report a fake success (the anti-fake-restore negative control). (2) **D05-02** — the `holo restore --pitr <timestamp>` operator command (pgBackRest `restore --type=time` to a named point, plus `--target-action=promote`). (3) **D05-03** — provision a **genuinely fresh** restore target with zero access to the original mini (separate network/credentials; no shared `PGDATA`, no shared blob volume, no mini reachability). (4) **D05-04** — run the full fire-drill restore end-to-end: Postgres PITR from R2 alone + blob restore via restic, then compare **row counts** and the **evidence-ledger as-of chain** pre/post-restore for exact match and every object **SHA-256 parity**. (5) **D05-05** — schedule the fire drill as a periodic mission (monthly) via the mission template system (`services/platform/src/mission/templates`) and author the operator runbook. (6) **D05-06** — an adversarial security review of the fresh-restore-target trust boundary (no mini lateral access, scoped R2 creds, no secret leakage into restored artifacts).

The gate is one un-fakeable outcome: **restore Postgres + blob storage from the R2 bucket alone onto a freshly provisioned machine yields a queryable DB whose row counts + evidence-ledger chain match the pre-failure snapshot, with zero access to the original mini** — and the negative control (empty/corrupted backup chain) fails closed, never a fake success.

> **Dependency caveat (advisor, non-blocking).** Sprint 28 depends on Sprint 27 (🟠 In Progress — the backup pipeline). This JIT expansion is planned against the current committed state (`2c3778c2`); it assumes the Sprint 27 `services/platform/src/backup/` module, `backup_heartbeat` table, pgBackRest repo, and R2 bucket exist by the time Sprint 28 runs. If the Sprint 27 `holo backup:*` command shape or the `backup_heartbeat` schema drifts, re-run `/kb-sprint-tasks-plan --sprint 28 --only D05-02,D05-04,D05-05 --overwrite` to refresh those three tasks.

## Human Testing Gate

**Gate:** An operator restoring Postgres/blob storage from the R2 bucket alone onto a freshly provisioned machine gets a queryable database whose row counts plus evidence-ledger chain match the pre-failure snapshot, with zero access to the original mini.

**Executable plan:** [`gate-plan.json`](./gate-plan.json) · operator notes: [`HUMAN-GATE.md`](./HUMAN-GATE.md)

**Dispatcher (required):** `bun services/platform/src/cli/holo.ts` — do not use a PATH `holo` stub.

**Automated pre-check oracles:**

```bash
# REDHAT-FIX-H1 — capability completeness (paths + CLI verbs → .tmp/REDHAT-FIX-H1/capability-inventory.json)
pnpm vitest run services/platform/tests/integration/sprint28-capability-inventory.test.ts

# REDHAT-FIX-H2 — human-gate surface oracles (outside-WAL, isolation, fire-drill surface, empty-chain)
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts

# Full empty/corrupt/healthy restore suite
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
```

## Human Test Deliverable

**Authoritative commands:** only `gate-plan.json` `literal_cmd` fields.  
**Operator surface:** regenerate [`HUMAN-GATE.md`](./HUMAN-GATE.md) via `bash scripts/render-human-gate-from-plan.sh` (embeds each step command + `literal_cmd_sha256`).

Do **not** paste obsolete fixed-path snippets (shared `step1-scratch`, `ro-test` live green, unbound `.tmp/REDHAT-FIX-H2/step3-*`).

**Live-run requirements:**

```bash
export HOLO_SECRETS_PATH="${HOLO_SECRETS_PATH:-services/platform/config/secrets.yaml}"
# Allowlisted GATE_RUN_ID required (alphanumeric + '-' / '_', length 1–64):
export GATE_RUN_ID="${GATE_RUN_ID:?set allowlisted GATE_RUN_ID}"
export PITR_TIMESTAMP="${PITR_TIMESTAMP:?set in-window ISO}"
# Then execute each gate-plan step (or follow regenerated HUMAN-GATE.md blocks).
```

Residual **`DEPENDENCY-S28-R2-RO`** until distinct live `R2_RESTORE_*` credentials exist and fresh SHA-bound QA records a real pass.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| D05-01 | RED: restore fails closed on empty/corrupted backup chain | red-test-generator | 60 min |
| D05-02 | `holo restore --pitr <timestamp>` operator command | devops-engineer | 150 min |
| D05-03 | Provision a genuinely fresh restore target (zero access to the original mini) | devops-engineer | 120 min |
| D05-04 | Run the full fire-drill restore (Postgres + blob) end-to-end | devops-engineer | 150 min |
| D05-05 | Schedule the fire drill as a periodic mission + author the runbook | devops-engineer | 90 min |
| D05-06 | Security review: fresh-restore-target trust boundary | security-reviewer | 60 min |
| REDHAT-FIX-C1 | Replace the synthetic D05-01 healthy fixture with a real pgBackRest chain and align the D05-01/D05-02 restore contract (review C-1) | devops-engineer | TBD |
| REDHAT-FIX-C2 | Make the D05-01 no-fake-success oracle fail closed on unavailable database state (review C-2) | red-test-generator | TBD |
| REDHAT-FIX-C3 | Correct the PITR recovery/promotion/LSN contract and executable assertions (review C-3) | devops-engineer | TBD |
| REDHAT-FIX-C4 | Align the monthly fire-drill mission with the existing mission schema and DSL without inventing fields (review C-4) | devops-engineer | TBD |
| REDHAT-FIX-C5 | Add an immutable, collision-resistant recovery baseline bound to the backup/WAL/blob snapshots (review C-5) | devops-engineer | TBD |
| REDHAT-FIX-H1 | Implement the complete D05-02 through D05-06 restore, fire-drill, mission, runbook, and security capability (review H-1) | devops-engineer | TBD |
| REDHAT-FIX-H2 | Make every Sprint 28 Human Testing Gate command and oracle executable against the implemented restore path (review H-2) | devops-engineer | TBD |
| REDHAT-FIX-H3 | Prove fresh-target isolation across network, IPC, mounts, identity, and alternate mini access paths (review H-3) | security-reviewer | TBD |
| REDHAT-FIX-H4 | Replace the destructive credential negative control with a sacrificial non-production object/policy proof (review H-4) | security-reviewer | TBD |
| REDHAT-FIX-H5 | Require exact concrete restore-bucket and prefix ARNs instead of wildcard credential scope (review H-5) | security-reviewer | TBD |
| GATE-FIX-QA1 | Scratch Postgres start after PITR + recovery-baseline emit/select so fire-drill parity is honest (QA `20260729T042338Z`) | devops-engineer | 180 min |
| REDHAT-FIX-S28R2-C1 | Execute complete fire drill on provisioned fresh-target volumes (CRITICAL-1 post-GATE-FIX-QA1) | devops-engineer | 180 min |
| REDHAT-FIX-S28R2-H1 | Refuse zero/empty required-domain recovery baselines at emit (HIGH-1) | devops-engineer | 60 min |
| REDHAT-FIX-S28R2-H2 | Exact restic existence at baseline selection (HIGH-2) | devops-engineer | 60 min |
| REDHAT-FIX-S28R2-H3 | Require distinct real read-only restore credentials (HIGH-3) | devops-engineer | 60 min |
| REDHAT-FIX-S28R2-H4 | Mandatory PITR sentinel cut proof (HIGH-4) | devops-engineer | 90 min |
| GATE-FIX-QA2 | In-window PITR metadata + listable restic-bound recovery baseline (QA `20260729T053810Z`) | devops-engineer | 120 min |
| GATE-FIX-QA3 | Window-bound recovery baseline target_timestamp (QA `20260729T061718Z`) | devops-engineer | 120 min |
| GATE-FIX-QA4 | Align step4/step5 assertions with jq -e scalar true (QA `20260729T064907Z`) | devops-engineer | 45 min |
| REDHAT-FIX-S28R3 | Bind six-step gate to provisioned fresh-target volumes + live distinct R2_RESTORE_* (Terra CRITICAL-1 + HIGH-1 on `e1e92211`) | devops-engineer | 180 min |
| GATE-FIX-S28R3-QA1 | Run-isolated gate scratch + host-accessible volume-bound fire-drill (QA `20260729T160000Z`) | devops-engineer | 120 min |
| GATE-FIX-S28R3-QA2 | Restore-only fire-drill identity, doc/plan lock, honest closeout (Terra `red-hat-20260729T084459Z` CRITICAL×3 HIGH×3) | devops-engineer | 240 min |
| GATE-FIX-S28R3-QA3 | File-backed identity distinctness, no live DB, required GATE_RUN_ID (Terra `red-hat-20260729T092559Z` CRITICAL×3 HIGH×1) | devops-engineer | 180 min |
| GATE-FIX-S28R3-QA4 | Baseline-only fresh-target, policy Action semantics, step2 GATE_RUN_ID (Terra `red-hat-20260729T095141Z` CRITICAL×1 HIGH×2) | devops-engineer | 150 min |
| GATE-FIX-S28R3-QA5 | Exact action/resource pairing + run-ID steps 3–5 + no Docker false-green (Terra `red-hat-20260729T101625Z` HIGH×2 MEDIUM×1) | devops-engineer | 120 min |
| GATE-FIX-S28R3-QA6 | Bounded collision-resistant fresh-target host from GATE_RUN_ID (QA `qa28-20260729T104535Z`) | devops-engineer | 90 min |
| GATE-FIX-S28R3-QA7 | Test-contract: QA3 host oracle + self-contained inventory fixture (Terra HIGH-1/MEDIUM-1) | devops-engineer | 60 min |
| GATE-FIX-S28R3-QA8 | Cloudflare temporary credential identity tuple (same parent AK + distinct secret + session) | devops-engineer | 90 min |

## Source Coverage

- UC-PLAT-06, T-PLAT-022, T-PLAT-025
- `.spec/prds/mk6-migration/04-uc-plat.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md`
- `.spec/prds/mk6-migration/10-technical-requirements/02-system-components.md`
- `.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-BAK-01: PITR + fresh-hardware fire-drill restore from the remote bucket alone (row-count + ledger-chain + blob parity), scheduled monthly

## Blocks

- Blocks: Sprint 31
- Depends on: Sprint 27

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-28T01:16:22Z (specialist proposals: **devops-engineer** primary impl D05-02/03/04/05; **red-test-generator** D05-01; **security-reviewer** D05-06). Avg quality **109/115** (min gate 80). Topological order: D05-01 (RED fail-closed, gates D05-02/D05-04 GREEN) ‖ D05-02 (restore cmd) + D05-03 (fresh target) → D05-04 (end-to-end fire drill) → D05-05 (monthly mission + runbook) → D05-06 (security review over 02–05).

**Fakeability audit (real tool, not hand-audited):** `validate_scenario.py` (`~/Projects/brain/tools/validate-scenario/`) was run on every behavioral AC of all 6 tasks → **0 CRITICAL** (4 residual HIGH — `NEG_OBSERVE_WEAK` heuristic edges on D05-02/D05-04/D05-06, non-blocking per SCENARIO-CONTRACT; only CRITICAL blocks the write). *Honest note:* the devops specialist left 2 mechanical CRITICALs unresolved across fix rounds; the consolidator applied surgical tightening (a concrete count anchor in D05-02 AC-3; normalizing the authored primary/tier intent onto the scenario objects in D05-05) to land 0 CRITICAL — **no ACs, scope, or assignments were authored by the orchestrator** (NEVER-TIER preserved; every task carries `proposed_by`).

- D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md
- D05-02-holo-restore-pitr-timestamp-operator-command.md
- D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md
- D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md
- D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md
- D05-06-security-review-fresh-restore-target-trust-boundary.md
- GATE-FIX-QA1-restore-start-and-recovery-baseline-parity.md — QA remediation for independent gate fail `20260729T042338Z` (step1 start; step3 zero/stale baseline + missing restic; steps 4–5 dependent)
- REDHAT-FIX-S28R2-C1-fire-drill-on-provisioned-fresh-target.md — CRITICAL-1 post `963e439e` (`red-hat-20260729T051314Z`)
- REDHAT-FIX-S28R2-H1-refuse-zero-empty-domain-baseline.md — HIGH-1
- REDHAT-FIX-S28R2-H2-exact-restic-at-selection.md — HIGH-2
- REDHAT-FIX-S28R2-H3-require-distinct-ro-restore-credentials.md — HIGH-3
- REDHAT-FIX-S28R2-H4-mandatory-pitr-sentinel-cut.md — HIGH-4
- HIGH-5 (stale human-gate evidence) is satisfied only by a later fresh unchanged six-step human gate — **not** a product task; do not hand-edit gate-results
- GATE-FIX-QA2-in-window-pitr-metadata-and-listable-restic-baseline.md — QA remediation for `20260729T053810Z` (stale PITR env vs live WAL window; ghost-only R2 baseline)
- GATE-FIX-QA3-window-bound-recovery-baseline-timestamp.md — QA remediation for `20260729T061718Z` (baseline target_timestamp after live backup/WAL window; selection empty)
- GATE-FIX-QA4-step4-5-assertion-match-jq-true.md — QA remediation for `20260729T064907Z` (step4/5 assertion tokens mismatch jq -e `true` output; literal_cmd frozen)
- REDHAT-FIX-S28R3-gate-fresh-target-and-live-restore-creds.md — Terra final independent `red-hat-20260729T075401Z` CRITICAL-1 (host-.tmp step3) + HIGH-1 (ro-test placeholders vs live R2_RESTORE_*)
- GATE-FIX-S28R3-QA1-run-isolated-scratch-and-host-accessible-volumes.md — QA `20260729T160000Z` step1 shared scratch + step3 `/var/lib/docker` EACCES on Colima/Desktop
- GATE-FIX-S28R3-QA2-restore-identity-doc-drift-and-honest-closeout.md — Terra `red-hat-20260729T084459Z` on `71f12cabe` CRITICAL-1..3 + HIGH-1/2/4 + MEDIUM cleanup
- GATE-FIX-S28R3-QA3-file-backed-identity-no-live-db-and-run-id.md — Terra `red-hat-20260729T092559Z` on `10bc18a0` CRITICAL-1..3 + HIGH-1 + MEDIUM×3
- GATE-FIX-S28R3-QA4-baseline-only-policy-actions-and-step2-run-id.md — Terra `red-hat-20260729T095141Z` on `dbb5c37b` CRITICAL-1 + HIGH-1/2 + MEDIUM-1
- GATE-FIX-S28R3-QA5-action-resource-pairing-and-run-id-evidence.md — Terra `red-hat-20260729T101625Z` on `a2109d8d` HIGH-1/2 + MEDIUM-1
- GATE-FIX-S28R3-QA6-bounded-host-from-gate-run-id.md — QA host length 65 refuse for long GATE_RUN_ID
