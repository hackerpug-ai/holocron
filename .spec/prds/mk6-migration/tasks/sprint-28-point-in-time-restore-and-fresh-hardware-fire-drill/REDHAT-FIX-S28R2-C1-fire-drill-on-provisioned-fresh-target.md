# REDHAT-FIX-S28R2-C1 — Execute complete fire drill on provisioned fresh-target volumes (CRITICAL-1)

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Proposed By: independent Terra High red-hat `red-hat-20260729T051314Z-sprint-28-post-gate-fix-qa1.md` CRITICAL-1  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

The full CAP-BAK-01 fire drill (Postgres PITR + restic blob + parity) restores into the **provisioned fresh target’s actual PGDATA and blob volumes** (or an equivalent real remote execution boundary for that target), with attestation that destinations are not host-local mini scratch and not arbitrary `.tmp` paths. The provisioner may still sleep as a hold process, but a first-class runner/CLI path must execute the drill against those volumes and prove it.

## Evidence
- Review: `.spec/reviews/red-hat-20260729T051314Z-sprint-28-post-gate-fix-qa1.md` CRITICAL-1  
- Reviewed SHA: `963e439e`  
- `scripts/provision-fresh-restore-target.sh` ends in `sleep infinity`  
- `holo restore:fire-drill` uses host `resolve(scratch)`  

## MUST
- MUST provide `scripts/run-fire-drill-on-fresh-target.sh` and/or `holo restore:fire-drill --fresh-target <name>` that binds restore destinations to the provisioned container’s named volumes (docker volume Mountpoint or in-container paths)
- MUST emit attestation JSON: container/host name, volume names, mountpoints/paths used as scratch+blob, and refuse if volumes cannot be resolved
- MUST prove with PLATFORM_IT (or scripted real docker) that fire-drill destinations match provisioned volume mountpoints
- NEVER weaken gate-plan / hand-edit gate-results  
- NEVER claim success on host-only `.tmp/REDHAT-FIX-H2` without fresh-target binding  

## ACs
### AC-1 [PRIMARY] Fresh-target volume-bound fire drill
GIVEN a provisioned fresh-restore target with named PGDATA+blob volumes  
WHEN `run-fire-drill-on-fresh-target` / CLI `--fresh-target` runs  
THEN scratch+blob resolve to those volumes’ mountpoints (or in-target paths) and attestation is written; refuse if target missing/unresolvable  

### AC-2 Integration proof
GIVEN PLATFORM_IT + docker available  
WHEN the fresh-target fire-drill path is exercised (or dry-run path that fails closed without volumes)  
THEN tests RED→GREEN prove binding + refusal of unbound host-only paths  

## VERIFY
`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts`  
`pnpm tsgo --noEmit` · `pnpm biome check scripts/ services/platform/src/backup/ services/platform/src/cli/`

## WRITE-ALLOWED
- `scripts/provision-fresh-restore-target.sh` (entrypoint/docs only if needed)
- `scripts/run-fire-drill-on-fresh-target.sh` (NEW)
- `services/platform/src/cli/holo.ts` (`--fresh-target` wiring)
- `services/platform/src/backup/fire-drill.ts` (attestation fields)
- `services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts` (NEW)
- `.tmp/REDHAT-FIX-S28R2-C1/**` (local only, never commit)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"REDHAT-FIX-S28R2-C1","requirements":[{"id":"AC-1"},{"id":"AC-2"}],"tdd_mode":"red_first","write_prohibited":["gate-plan.json","gate-results.json","gate-verification.json",".gate-evidence/"]}
-->
