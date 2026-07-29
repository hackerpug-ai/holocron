# GATE-FIX-S28R3-QA1 — Run-isolated gate scratch + host-accessible volume-bound fire-drill

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra QA `20260729T160000Z` on main `16b201706131a8b7b750c3053055fa43e525447b`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa1-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

1. **Step 1 (and other fixed scratch paths)** are self-isolating per `GATE_RUN_ID` so a prior restore cannot leave non-empty PGDATA that fails the next QA with `scratch PGDATA must be empty before restore (strict)`. Strict empty-PGDATA safety stays; do not broaden accepted errors.
2. **Step 3 volume-bound fire-drill** writes into the provisioned named Docker volumes via a **host-accessible** execution mechanism on real Docker (Colima/Desktop). Do not pass inaccessible daemon paths like `/var/lib/docker/volumes/.../_data` to host Bun. Preserve durable attestation of volume IDs + mount bindings. Do not substitute unbound host `.tmp/REDHAT-FIX-H2` scratch as the volume claim.

Preserve **DEPENDENCY-S28-R2-RO** / step2 live RO invariant unchanged. Never fabricate `R2_RESTORE_*`, reuse ambient RW as RO proof, or accept `ro-test` as live green.

## Evidence (immutable)

| Item | Fact |
|------|------|
| Run | `20260729T160000Z` · SHA `16b20170` · verified fail, 1/6, zero discrepancies |
| Step1 | Fixed `.tmp/REDHAT-FIX-H2/step1-scratch` → `scratch PGDATA must be empty before restore (strict)` |
| Step2 | Honest residual `DEPENDENCY-S28-R2-RO` (external; leave intact) |
| Step3 | Bound `/var/lib/docker/volumes/.../_data` → `EACCES: permission denied, mkdir '/var/lib/docker'` |
| Steps4–5 | Missing parity-report after step3 fail |
| Step6 | Passed (empty-chain) but uses fixed `step6-scratch` — apply same isolation safety |

## MUST

### AC isolation
- MUST rewrite gate-plan step1 (and step6) scratch/log paths to include `${GATE_RUN_ID:-manual}` (or equivalent unique run id) under `.tmp/` so repeats never share PGDATA with prior runs
- MUST NOT relax strict empty-PGDATA checks in product code
- MUST NOT wipe/reuse historical evidence dirs or `.tmp/D05-*`

### AC volume host-access
- MUST make `run-fire-drill-on-fresh-target.sh` (and CLI `--fresh-target` if it duplicates the bug) resolve an **execution path that host tools can write** while still targeting the provisioned volumes
- Preferred patterns (any one complete solution):
  - Bind-mount named volumes to host staging under the provisioned target (driver_opts device = host path under repo `.tmp/.../fresh-restore/<host>/`) so host Bun writes the same bytes the container mounts; **or**
  - Detect non-writable Mountpoint and use volume Options.device / paths.txt host_staging when that path is the volume's data; **or**
  - Execute restore inside a container that mounts `${host}-pgdata` / `${host}-blobs` with tools available — still emit host-side report + attestation
- MUST refuse unbound `.tmp/REDHAT-FIX-H2/step3-*` as the volume destination
- MUST attest: volume names, daemon Mountpoint (if any), **host_execution_path** actually used, container paths, schema `holo.fresh-target.fire-drill-attestation.v1`
- MUST produce parity-report on success when prerequisites available
- MUST work against real Docker (PLATFORM_IT)

### Invariants
- Step2 + REQUIRE_LIVE_R2_RO + DEPENDENCY-S28-R2-RO unchanged in spirit
- No assertion weakening of steps 4–5 jq predicates
- No hand-edit of gate-results / .gate-evidence/**
- No Sprint 27 / surface 137 / D05 tmp mutation

## ACs

### AC-1 [PRIMARY] — Step1 run-isolated scratch
GIVEN gate-plan step1  
WHEN `GATE_RUN_ID` is set  
THEN scratch path includes that id (not a fixed shared `.tmp/REDHAT-FIX-H2/step1-scratch` alone)  
AND a pre-seeded contaminated fixed path cannot affect the new command's PGDATA  

### AC-2 — Step6 (and any other fixed gate scratch) isolated the same way  
### AC-3 [PRIMARY] — Host-accessible volume-bound fire-drill  
GIVEN provisioned `${host}-pgdata` + `${host}-blobs` on Colima/Desktop  
WHEN `run-fire-drill-on-fresh-target.sh` runs (not resolve-only)  
THEN host process does not mkdir/write `/var/lib/docker/...`  
AND restore destinations are bound to the provisioned volumes (host bind device or in-container mount of those volumes)  
AND attestation records volume IDs + execution paths  
AND on successful fire-drill prerequisites, parity-report is written  

### AC-4 — Refuse unbound host-only H2 step3 paths  
### AC-5 — Step2 DEPENDENCY-S28-R2-RO residual preserved when keys absent  
### AC-6 — Tests RED→GREEN; PLATFORM_IT against real Docker for volume path  

## VERIFY

```bash
bash -n scripts/run-fire-drill-on-fresh-target.sh scripts/provision-fresh-restore-target.sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa1-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
pnpm tsgo --noEmit
```

## WRITE-ALLOWED

- `gate-plan.json` (step1/3/6 literal_cmd paths as needed; do not weaken claims; step2 residual preserved)
- `scripts/run-fire-drill-on-fresh-target.sh`
- `scripts/provision-fresh-restore-target.sh` (bind volume driver_opts if required)
- `services/platform/src/cli/holo.ts` (`--fresh-target` path resolution only)
- `services/platform/src/backup/fire-drill.ts` only if attestation fields require it
- Tests under `services/platform/tests/integration/sprint28-s28r3-qa1-gate-fix.test.ts` (NEW) + existing fresh-target tests
- Task file / SPRINT.md row / dual-lens note under `.spec/reviews/`
- `.tmp/GATE-FIX-S28R3-QA1/**` local evidence

## WRITE-PROHIBITED

- `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, `.gate-evidence/**`
- Fabricating `R2_RESTORE_*` / weakening step2
- Sprint 27, `.tmp/D05-*`, orchestration unrelated files
- Relaxing strict empty-PGDATA

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S28R3-QA1",
  "qa_run_id": "20260729T160000Z",
  "reviewed_sha": "16b201706131a8b7b750c3053055fa43e525447b",
  "requirements": [
    {"id": "AC-1", "primary": true},
    {"id": "AC-2"},
    {"id": "AC-3", "primary": true},
    {"id": "AC-4"},
    {"id": "AC-5"},
    {"id": "AC-6"}
  ],
  "tdd_mode": "red_first",
  "residual_preserved": "DEPENDENCY-S28-R2-RO",
  "write_prohibited": ["gate-results.json", "gate-verification.json", ".gate-evidence/", "services/platform/config/secrets.yaml"]
}
-->
