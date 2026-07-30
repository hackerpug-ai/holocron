# GATE-FIX-S28R3-QA23 — Real credential transport and hermetic gate closure

**Task id:** `GATE-FIX-S28R3-QA23`
**H1 id:** `GATE-FIX-S28R3-QA23`
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill
**Binding review:** `red-hat-20260730T010953Z-sprint-28-main-sha-928f66b02119596df60b82d6ac21820918c98b86`
**Source SHA:** `928f66b02119596df60b82d6ac21820918c98b86`

## Intent

Close every CRITICAL/HIGH finding from the binding Terra review without weakening the gate, validator, trust boundary, or evidence requirements.

1. Eliminate every remaining caller-PATH executable from the authoritative six-command stream and every credential-bearing descendant path.
2. Remove restore/R2/restic secrets from intermediate process arguments, including `/usr/bin/env` and `docker exec -e` launchers.
3. Replace source-text and copied-redactor oracles with a direct negative test of the production credential transport boundary.
4. Apply the signed/root-owned executable boundary to all credential-receiving Bun and pgBackRest paths, including base backup and R2 provisioning.
5. Prove the mandatory full-suite → live R2 proof → full-suite sequence is hermetic without writing tracked probe state.
6. Remove the QA22 trailing whitespace regression.

## Acceptance criteria

- [x] The literal commands in `gate-plan.json` and their credential-bearing child scripts use fixed absolute executables or a single validated trusted-runtime boundary for every external program, including `bun`, `grep`, `env`, `nc`, `python3`, `docker`, `mkdir`, and any newly introduced helper.
- [x] An ordered hostile-PATH test executes the authoritative literal command stream, shadows every external command word reachable while credentials are ambient, and fails on any shadow marker. A patched/mock gate harness is not accepted.
- [x] No secret value is serialized into an intermediate process argv. This includes `env -i KEY=secret`, `docker exec -e KEY=secret`, redactor argv, and equivalent wrapper arguments. Secret transfer uses protected stdin/FD or another mechanism whose actual launcher argv is secret-free.
- [x] A production-boundary canary test runs the real fresh-target/R2 credential transport, observes the actual launcher and child argument vectors, recursively scans outputs/evidence/artifacts, and fails if any canary appears in argv, output, artifact, or object body. Reimplementing the production redactor or checking only source text is not accepted.
- [x] `base-backup.ts`, `r2-provision.ts`, `fire-drill.sh`, and every other credential-receiving Bun/pgBackRest/restic entrypoint validate and execute an absolute signed/root-owned binary before credentials exist; ambient caller PATH and user-owned overrides are rejected.
- [x] QA16/QA22/QA23 tests never write `scripts/lib/r2-scope-probes.json` or a tracked `.qa16bak`; malformed fixtures live in isolated temporary script trees.
- [x] A recorded exact sequence passes from clean state: full Sprint 28 suite, mandatory live R2 readonly proof, full Sprint 28 suite again. Record exit codes, test totals, byte hash of the tracked probe before/after every phase, and `.qa16bak` absence.
- [x] D05-01 through D05-06 still pass the current scenario validator with zero CRITICAL/HIGH findings.
- [x] All QA21 and QA22 race, canary, SigV4, exact-count/default-count, evidence, rejected-commit, and live R2 closures remain intact.
- [x] `git diff --check 928f66b02119596df60b82d6ac21820918c98b86..HEAD` passes with no trailing whitespace.
- [x] TypeScript, focused QA23/QA22/QA21 tests, two exact full Sprint 28 suites around live R2, shell syntax, Python compile, hooks, and dual-lens product/security/test-quality review all pass.

## Status

✅ Completed — landed on main as 9f6a84a05797396d48cfe3c582431ce31b82da0d (merge 3b6664ec).
