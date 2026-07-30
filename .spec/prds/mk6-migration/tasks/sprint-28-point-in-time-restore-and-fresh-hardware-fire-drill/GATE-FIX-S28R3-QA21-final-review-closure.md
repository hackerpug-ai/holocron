# GATE-FIX-S28R3-QA21 — Final review credential/race/oracle closure

> Status: ✅ Complete
> Sprint: [Sprint 28](./SPRINT.md)
> Agent: devops-engineer / security / test-quality
> Reviewer: code-reviewer + security-reviewer + test-quality-reviewer
> Priority: P0
> Source review: `red-hat-20260729T234248Z-sprint-28-main-sha-b4848145dbfd0115f5e0dd5feb2e1ff32743a1c0.md`
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Close every finding from the Terra High review of `b4848145` while preserving QA19's signed root-owned Bun solution and the live prefix-scoped R2 security contract. Make the exact Human Gate deterministic and success-capable without weakening tests, evidence, credential isolation, or negative controls.

## MUST (implemented)

1. Fixed `/bin/bash` for credential entrypoints (gate-plan + shebangs); hostile-PATH coverage.
2. Trusted root-owned pgBackRest/restic resolve before credentials; no PATH/Homebrew discovery; fire-drill child PATH `/usr/bin:/bin`; child diagnostics redacted.
3. Absolute helpers for date/mktemp/uuidgen/tr in credential-bearing paths.
4. Deterministic consumer-level file + parent proof races on provision and fire-drill (harness seams).
5. Discriminating success/error canary oracle requiring both consumer paths and all contract artifacts with raw recursive scan.
6. SigV4 transport-level `_request` + `urlopen` capture regression (QA19 fix + QA21 oracle).
7. QA13 multi-process canary explicit 120s timeout.
8. tools.test: reject `3.5` count; omitted list_improvements limit defaults to 20.
9. Trailing whitespace cleanup on QA18/QA20.

## NEVER

Use `--no-verify` · weaken/skip tests · credentials to user-owned/PATH runtimes · fake recorder in real gate · revive `31fee195` · touch Sprint 27 / `.env` · merge to main

## Operational prerequisite

Credential-bearing TypeScript restore (Bun + holo.ts) requires root-owned `pgbackrest` at `/usr/local/bin/pgbackrest` or `/usr/bin/pgbackrest` (and restic similarly for baseline verify). Homebrew/user-owned binaries are refused.

## VERIFY

See task VERIFY block in the implementer brief (tsc, tools, QA19+QA21, full sprint28 suite ×2, bash -n, py_compile, diff --check, live R2).
