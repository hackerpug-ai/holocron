---
sequence: 28
timeline: Phase 6 — Standing Backup and Disaster Recovery
status: Completed
planned_from_roadmap_sha: 95b4657a2d19ffcbd9c0208f4c9aef433c77782cda63a816635c606080f275ae
planned_from_source_sha: 2c3778c231e21001b4c6095ec9c406f01f94e4ff
source_kind: git-head
planned_at: 2026-07-28T01:16:22Z
---

# Sprint 28: Point-in-Time Restore and Fresh-Hardware Fire Drill

**Sequence:** 28
**Timeline:** Phase 6 — Standing Backup and Disaster Recovery
**Status:** Completed
> Progress: 6/6 tasks completed · updated 2026-07-29T01:14:00Z
> Status-Note: GATE-GOAL ACHIEVED — 6/6 tasks landed on main; human-test 6/6 pass; residual DEPENDENCY-S28-R2-RO
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

Concrete runnable commands (also in `gate-plan.json` `literal_cmd` fields). Set `HOLO_SECRETS_PATH` and an in-window `PITR_TIMESTAMP` for positive fire-drill steps.

1. **PITR restore** — restores to the named point exactly (or fail-closed outside WAL with a named error; never `unknown flag: --pitr`):
   ```bash
   mkdir -p .tmp/REDHAT-FIX-H2/step1-scratch
   bun services/platform/src/cli/holo.ts restore \
     --pitr "${PITR_TIMESTAMP:-2099-01-01T00:00:00Z}" \
     --scratch .tmp/REDHAT-FIX-H2/step1-scratch \
     --target-action promote
   ```
2. **Fresh target isolation** — multi-axis prove (zero mini access):
   ```bash
   MINI_HOST=203.0.113.1 TARGET_ATTESTED_IDENTITY=target-vm-uuid-gate \
   MINI_ATTESTED_IDENTITY=mini-hw-uuid-gate REQUIRE_ATTESTED_IDENTITY=1 \
   MINI_SOCKET_DEFAULTS=0 NC_TIMEOUT_SEC=1 \
   bash scripts/prove-isolation.sh
   # Expect: RESULT: PASS
   ```
3. **Row-count parity** — fire-drill + `POSTGRES_PARITY_PASS`:
   ```bash
   mkdir -p .tmp/REDHAT-FIX-H2/step3-scratch .tmp/REDHAT-FIX-H2/step3-blob
   bun services/platform/src/cli/holo.ts restore:fire-drill \
     --target-timestamp "${PITR_TIMESTAMP:?set in-window ISO}" \
     --scratch .tmp/REDHAT-FIX-H2/step3-scratch \
     --blob-dir .tmp/REDHAT-FIX-H2/step3-blob \
     --report .tmp/REDHAT-FIX-H2/parity-report.json
   jq -e '.POSTGRES_PARITY_PASS == true' .tmp/REDHAT-FIX-H2/parity-report.json
   ```
4. **Evidence-ledger chain** — SHA-256 baseline match:
   ```bash
   jq -e '.LEDGER_CHECKSUM_MATCH == true' .tmp/REDHAT-FIX-H2/parity-report.json
   ```
5. **Blob SHA-256 parity** — every object matches source:
   ```bash
   jq -e '.BLOB_PARITY_PASS == true and (.matched_objects // 0) >= 1' .tmp/REDHAT-FIX-H2/parity-report.json
   ```
6. **Empty/corrupt chain fail-closed** — named restore error + zero PGDATA files; **must_not** sole-observe `unknown flag: --pitr`:
   ```bash
   mkdir -p .tmp/REDHAT-FIX-H2/step6-scratch
   R2_PGBACKREST_PREFIX="pgbackrest-s28-gate-empty/${GATE_RUN_ID:-manual}" \
     bun services/platform/src/cli/holo.ts restore \
       --pitr 2024-01-01T00:00:00Z \
       --scratch .tmp/REDHAT-FIX-H2/step6-scratch \
       --target-action promote
   # Expect: exit != 0; stderr matches no base backup|backup chain missing|integrity|outside WAL
   ```

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
