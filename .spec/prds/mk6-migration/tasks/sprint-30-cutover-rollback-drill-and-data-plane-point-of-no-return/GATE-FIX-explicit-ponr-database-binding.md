# GATE-FIX-explicit-ponr-database-binding — Bind rollback/PONR oracles to one database and lifecycle the exact C-3 marker

> **Task ID:** GATE-FIX-explicit-ponr-database-binding
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `mastra-implementer` (platform/rollback owner; coordinate gate-shell review with `devops-engineer`)
> **Reviewers:** `mastra-reviewer` + independent `security-reviewer`; standing test-reality = `test-quality-reviewer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** [2026-08-08 stale-nonprod-PONR handoff](./HANDOFF-20260808T0300Z-stale-nonprod-ponr.md), gate `20260808T024946Z` partial 3/5
> **Source plan:** `/Users/inference1/.codex/attachments/d04f8f64-b07d-4083-aef6-44dc406ef7a5/pasted-text-1.txt`
> **Planning HEAD:** `826e2ac9609138dff7341b7b95470568578a1abc`
> **Proposed by:** `mastra-planner`
> **TDD:** `red_first` · `RED_GREEN_REQUIRED=yes` · `seeded_evidence=yes` · real Postgres only
> **Status:** Backlog (plan-only — no implementation in this commit)
> **Branch:** implementer task branch; unreviewed work NEVER merges; merge only after independent review APPROVED
> **Blocks:** Sprint 30 closeout and Sprint 31 Convex decommission

## Outcome

Rollback, PONR, child, and audit decisions use one explicit credential-free database identity, while exact C-3 cleanup preserves legitimate marker-database state.

This is a deterministic cutover workflow, not an agent/LLM feature. No Mastra Agent, tool, memory, processor, scorer, or model changes are required. The `mastra-implementer` assignment reflects ownership of the MK-VI platform and Postgres cutover code.

## Critical constraints

- Never broad-reset `holocron_nonprod`/the marker target or alter legitimate marker-database audit rows.
- Never resolve rollback core behavior from ambient `DATABASE_URL`, add a database URL CLI flag, or place a database URL on argv.
- Never emit raw URLs, userinfo, passwords, query strings, fragments, or credential-bearing environment values.
- Never delete a partial/foreign marker row or disable any trigger except the two exact PONR immutability triggers.
- Never claim closure from mocks, one database, partial gate output, an unreviewed/stale revision, or non-recomputed evidence.

## Done when

- Required explicit `databaseUrl` flows from each CLI boundary through repoint/drill/child/PONR/audit/recompute, and unequal child identity fails `DATABASE_TARGET_MISMATCH`.
- Real two-database RED/GREEN tests prove contradictory PONR/audit isolation, real child binding, mismatch rejection, and no ambient mutation.
- Exact marker cleanup preserves the full audit count+digest and restores/verifies only both named triggers on success and forced failure.
- The gate rejects bad/equal targets before mutation and cleans the marker before C-3 and from its RC-preserving EXIT trap.
- Targeted/full checks and commit hooks pass on only the exact WRITE-ALLOWED paths; independent reviewers can decide from task-commit evidence alone.

## Finding and current evidence

The handoff proves a database split, but explicitly does **not** prove the propagation path: the production preflight cleared `holocron.data_plane_ponr`, while step 1 reported the old synthetic row that exists in `holocron_nonprod`. The orchestrator owns the pre-dispatch causal experiment below; it is not an implementer acceptance criterion or a dependency on private `.tmp` files during code review.

Current source contains four concrete ambiguity seams:

| Seam | Current behavior | Required behavior |
|---|---|---|
| `runRollbackRepoint` | `readDataPlanePonr()` and `loadPostExportWriteAuditAsync(...)` omit `databaseUrl`; both may resolve from ambient `DATABASE_URL` | `databaseUrl` is required and the exact value is passed to both reads |
| `runRollbackDrill` | resolves an optional DB, but does not pass it to the repoint child or independent audit recompute | one required DB flows to verify-tools, child, probes, recompute, and report |
| `spawnRollbackRepointCli` | child inherits caller environment; no database binding | required parent DB overwrites child `DATABASE_URL` after ambient env composition |
| `runVerifyTools` | assigns `process.env.DATABASE_URL = options.databaseUrl` | never mutates ambient process state; passes the explicit local value to DB consumers |
| human gate | validates `DATABASE_URL` and marker URL only after steps/results/verification | validates both targets and inequality before any ledger/fence/step mutation |
| C-3 marker | opt-in seed can survive the run and poison a later run | exact marker is removed before C-3 and from an EXIT trap, with audit/trigger preservation proof |

### Orchestrator-owned pre-dispatch prerequisite (not an implementer AC)

Before dispatch, the orchestrator captures the planning-parent path with the production/gate PONR empty and the exact stale marker present, surgically removes only that full-identity marker, and reruns the same path. Its sanitized disposition must say whether removal changed steps 1–2 from the stale `POST_PONR_INELIGIBLE`/zero-loss failure to green. The cleanup leg must record marker delta only, unchanged marker-database audit count+digest, and both triggers `O`; correlation alone is not causal proof. If the result disproves this source path and the actual source remains unknown, stop and re-plan rather than asking the implementer to land a speculative fix. Primary raw evidence remains operator-local and is not required for implementer approval.

Known synthetic row identity from `probe-ponr-role-immutability-negative-marker.sh`:

```text
write_surface                         = probe.seed
write_table                           = documents
write_row_id                          = 00000000-0000-4000-8000-aaaaaaaaaaaa
write_row_digest_sha256               = ab repeated 32 times (64 hex chars)
base_url                              = http://127.0.0.1:9
operator                              = probe-seed
run_id                                = s30-marker-miss-seed
idempotency_key                       = s30-marker-miss-seed-idem
convex_fence_audit_id                 = seed
convex_fence_env_value                = 1
convex_documents_total                = 0
convex_newest_document_creation_time  = 0
convex_accepted_writes_since_watermark = 0
convex_rejected_writes_since_watermark = 0
```

`id`, timestamps, and `export_watermark_ms` are generated values and are not synthetic identity fields. Cleanup may delete exactly one row only when **every fixed field above** matches. Zero rows is an idempotent no-op; more than one row or any foreign/partially matching row is a hard failure with no deletion.

## Safety invariant and data flow

```text
CLI boundary
  resolve/validate DATABASE_URL once
          │
          ├── runRollbackRepoint({ databaseUrl: required })
          │     ├── readDataPlanePonr({ databaseUrl })
          │     └── loadPostExportWriteAuditAsync({ databaseUrl })
          │
          └── runRollbackDrill({ databaseUrl: required })
                ├── runVerifyTools({ databaseUrl })  [no process.env mutation]
                ├── probeFiveWriteSurfaces({ databaseUrl })
                ├── child env DATABASE_URL := exact parent value
                ├── child RollbackRepointReport.database_target
                ├── parent/child identity equality or DATABASE_TARGET_MISMATCH
                └── loadPostExportWriteAuditAsync({ databaseUrl })

Gate DATABASE_URL ──────────────── must be canonically unequal ───────────── Marker DB
  broad Sprint-30 reset allowed                                           exact marker cleanup only
  (authorized gate ledger/PONR only)                                      audit count+digest unchanged
                                                                          two named triggers restored O
```

The database identity is evidence, not a credential:

```ts
type DatabaseTargetIdentity = {
  host: string;       // lower-case URL hostname; no userinfo
  effective_port: number; // 5432 when omitted
  database: string;   // decoded database name without query/fragment
  fingerprint: string; // sha256 of versioned host\0port\0database tuple
};
```

The identity helper must accept only `postgres:`/`postgresql:` URLs, reject missing host/database and invalid ports, normalize scheme/default port/host case, and exclude username, password, query parameters, and the raw/canonical URL from its return value and every report. Compare all four fields; fingerprint-only comparison is insufficient. The hash input must be versioned and NUL-delimited so concatenation cannot alias.

## Required implementation design

### 1. Explicit rollback database contract

Change the internal APIs so omission is a TypeScript error:

```ts
runRollbackRepoint(options: { databaseUrl: string; ... }): Promise<RollbackRepointReport>
runRollbackDrill(options: { databaseUrl: string; ... }): Promise<DrillReport>
spawnRollbackRepointCli(options: { databaseUrl: string; ... }): ChildResult
```

- Do not keep an optional overload, default argument, `process.env.DATABASE_URL` fallback, or `resolveDatabaseUrl(...)` call in these three internal functions.
- Resolve and validate once inside the registered `cutover:rollback-repoint` and `cutover:rollback-drill` CLI cases, then pass the value. There is **no** `--database-url`, `--db`, or equivalent CLI flag.
- Child env ordering is `...ambientEnv` first and `DATABASE_URL: options.databaseUrl` last. A caller-supplied ambient marker URL cannot win.
- `runRollbackRepoint` passes the same value to `readDataPlanePonr` and `loadPostExportWriteAuditAsync`.
- `runRollbackDrill` passes the same value to `runVerifyTools`, `probeFiveWriteSurfaces`, the child, and `loadPostExportWriteAuditAsync` for independent recomputation.
- `runVerifyTools` must not write/delete/restore `process.env.DATABASE_URL`; use a local explicit dependency for seed and oracle reads. A concurrency test must prove two overlapping calls cannot redirect one another through ambient mutation.
- Update every direct test/caller listed by `rg 'runRollback(Repoint|Drill)\\('` atomically.

### 2. Target identity and mismatch failure

- Add one shared credential-free target identity helper in `services/platform/src/db/connection.ts`. Do not duplicate URL parsing in drill, repoint, gate, and tests.
- Add `database_target: DatabaseTargetIdentity` to every success/failure `RollbackRepointReport` and `DrillReport` shape, including early authorization/ledger failures.
- The drill computes its identity from its required input before work, reads the child report identity, and compares host, effective port, database, and fingerprint.
- Missing/malformed/unequal child identity yields `ok:false`, `repointed:false`, `error.code='DATABASE_TARGET_MISMATCH'` before the drill can accept child success or zero-loss. The message/report may name credential-free fields and fingerprints only.
- A child with target A and parent with target B must fail even if child exit is 0, `repointed:true`, accepted count is 0, and live acknowledgements exist.
- Do not print, serialize, snapshot, or place on argv the raw DB URL, username, password, query string, or credential-bearing environment.

### 3. Exact marker lifecycle

Implement one shared exact-marker contract used by seed and cleanup (Rule of 2; no drift between shell SQL literals) on these surfaces:

- `services/platform/src/cutover/ponr-marker.ts` — identity constants, target validation, exact inspect/seed/cleanup operations
- `scripts/cleanup-sprint30-ponr-marker.sh` — thin env-only wrapper; accepts evidence output path only, never a URL flag
- update `scripts/probe-ponr-role-immutability-negative-marker.sh` to consume the shared marker identity/operation rather than maintaining a second field list

Cleanup contract:

1. Require `DATABASE_URL` (gate) and `HOLO_PROBE_MARKER_MISS_DATABASE_URL` (marker) from environment.
2. Parse both as PostgreSQL targets and fail before SQL if malformed or canonically equal (including `postgres://` vs `postgresql://`, omitted vs explicit `:5432`, host case, or credential aliases).
3. Require both named PONR triggers to exist and be `tgenabled='O'` before cleanup. Do not repair or bless an unexpectedly disabled starting state.
4. Read the complete marker table. Accept only zero rows or exactly one row matching every fixed field above. Reject any foreign row, partial match, or multiplicity without deleting anything.
5. Capture `post_export_write_audit` row count plus stable whole-table content digest in primary-key order inside the cleanup transaction.
6. Temporarily disable **only** `data_plane_ponr_reject_mutation` and `data_plane_ponr_reject_truncate`; never `ALL`, `USER`, or any third trigger.
7. Delete by row id **and** repeat the full fixed-field predicate; require affected row count exactly 1 when a marker existed.
8. Restore both named triggers in transaction/finally handling. A SQL failure rolls back trigger changes; an outer `finally` verifies both are `O` and fails closed if not. Do not swallow the original error or restoration error.
9. Recompute audit count+digest before commit and require exact equality. Cleanup never calls `clearPostExportWriteAuditLedger`, never truncates/deletes audit rows, and never rewrites its file mirror.
10. Emit a credential-free JSON report containing identities, marker before/after count, match disposition, audit before/after count+digest, exact named-trigger before/after states, delete count, and `ok`; never emit connection URLs.

`holocron_nonprod` contains legitimate ETL/upload audit history (two rows at handoff). Broad reset of `holocron_nonprod`, `TRUNCATE post_export_write_audit`, `clearPostExportWriteAuditLedger` against the marker DB, or reusing `reset-sprint30-gate-ledger.sh` against the marker DB is explicitly forbidden.

### 4. Gate ordering and cleanup trap

In `scripts/run-sprint30-human-gate.sh`:

- Validate both required DB env values, PostgreSQL URL shape, credential-free identities, and canonical inequality before ledger reset, PONR clear, fence re-arm, live write proof, or gate step 1.
- Register the marker cleanup EXIT trap immediately after validation. Preserve the gate's original exit status; if main work succeeded but cleanup fails, exit nonzero. Evidence must distinguish main RC and cleanup RC.
- Invoke exact cleanup once immediately before the C-3 success/negative block, so the opt-in seed begins from zero exact marker rows.
- Keep the EXIT trap armed through every C-3 success and failure path; after `HOLO_PROBE_SEED_PONR=1` seeds the marker, the trap removes it.
- Verify the trap's postcondition: marker count 0, both named triggers `O`, audit count+digest equal to the trap's pre-cleanup snapshot.
- Do not defer URL checks until after gate results/verification as current code does.
- Do not weaken the gate reset on the **gate** DB: the designated Sprint 30 reset may still clear gate PONR/audit rows before the drill. Add a fail-closed identity assertion that this reset target equals the already validated gate identity and differs from marker identity.
- Do not add DB URL CLI flags, log raw URLs, or include credentials in `@@GATE-META`, JSON, stdout/stderr, evidence, or process argv.

## Scope (exact implementation WRITE-ALLOWED paths)

Every path not listed below is write-prohibited for this implementation task:

- `services/platform/src/db/connection.ts` — credential-free target identity/validation/equality helper
- `services/platform/src/cutover/rollback-repoint.ts` — required DB, explicit PONR/audit reads, report identity
- `services/platform/src/cutover/rollback-drill.ts` — required DB, child propagation, explicit recompute, mismatch failure/report identity
- `services/platform/src/cutover/soak-fence.ts` — remove `runVerifyTools` ambient DB mutation; explicit local DB flow
- `services/platform/src/cli/holo.ts` — resolve/validate at the two CLI boundaries; no URL flag
- `services/platform/src/cutover/ponr-marker.ts` (new) — shared exact marker operation
- `scripts/cleanup-sprint30-ponr-marker.sh` (new) — env-only gate wrapper
- `scripts/probe-ponr-role-immutability-negative-marker.sh` — shared seed identity/use, no residual marker
- `scripts/run-sprint30-human-gate.sh` — early validation, pre-C3 cleanup, EXIT trap
- `services/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts` (new) — real two-DB production-path tests
- `tests/cutover/gate-fix-explicit-ponr-database-binding.test.ts` (new) — shell/order/credential-output contracts where behavioral process execution is appropriate
- existing direct-caller tests that fail compilation after required signature changes:
  - `services/platform/tests/integration/sprint29-rollback-repoint.test.ts`
  - `services/platform/tests/integration/sprint29-soak-flip.test.ts`
  - `services/platform/tests/integration/sprint30-rollback-drill.test.ts`
  - `services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts`
- `.tmp/GATE-FIX-explicit-ponr-database-binding/**` — RED/GREEN/runtime evidence only (do not commit secrets)

Before editing, run the direct-caller `rg` commands in the verification section and record the results. If they reveal a required consumer outside this list, stop and obtain a task-scope amendment before editing that file. Do not touch the untracked Sprint 31 directory or unrelated source.

## Acceptance Criteria

- [ ] **AC-1 — required internal database dependency [PRIMARY].** GIVEN TypeScript callers of `runRollbackRepoint`, `runRollbackDrill`, and `spawnRollbackRepointCli` WHEN `databaseUrl` is omitted THEN typecheck fails. GIVEN a supplied value WHEN the functions run THEN none resolves/falls back to ambient `DATABASE_URL`; both CLI cases resolve/validate once and pass it. No DB URL CLI flag exists.

- [ ] **AC-2 — consistent PONR/audit target.** GIVEN ambient `DATABASE_URL` points to a marker DB with a PONR row and explicit rollback DB points to a clean gate DB WHEN `runRollbackRepoint` runs THEN `readDataPlanePonr`, authoritative audit load, and report identity all use the clean gate DB; the marker cannot cause `POST_PONR_INELIGIBLE`. GIVEN the explicit gate DB contains a real PONR WHEN the same call runs THEN it fails `POST_PONR_INELIGIBLE` bound to that gate row even if ambient DB is clean.

- [ ] **AC-3 — child and recompute binding.** GIVEN `runRollbackDrill({databaseUrl: gate})` and an ambient/supplied child env naming marker WHEN the real child CLI is spawned THEN child `DATABASE_URL` is gate, child report identity equals parent, five-surface DB work and independent `loadPostExportWriteAuditAsync` recompute use gate, and ambient env is unchanged after the call. `runVerifyTools` must not mutate `process.env.DATABASE_URL`.

- [ ] **AC-4 — mismatch fails closed.** GIVEN a genuine real child report from database B whose other prerequisites pass is evaluated by a drill bound to database A WHEN the production acceptance seam runs THEN drill acceptance fails first with `DATABASE_TARGET_MISMATCH`, `ok:false`, and `repointed:false`. Missing/malformed identity is the same failure class. A mutation removing or inverting the production target comparison must make the test fail.

- [ ] **AC-5 — credential-free identity.** GIVEN URLs that differ only by scheme alias, userinfo/password, host case, or omitted/default port WHEN identity is derived THEN host/effective port/database/fingerprint are stable and equal. GIVEN distinct host, effective port, or database THEN identity is unequal. Reports, logs, argv, and evidence contain none of the secret canaries, username/password, raw URL, query, or fragment.

- [ ] **AC-6 — exact marker deletion only.** GIVEN zero marker rows WHEN cleanup runs THEN it succeeds idempotently without disabling triggers. GIVEN exactly one full-identity synthetic row WHEN cleanup runs THEN exactly that row is deleted. GIVEN one field differs, a foreign row exists, or multiplicity is unexpected THEN cleanup exits nonzero and preserves every PONR row.

- [ ] **AC-7 — trigger and audit preservation.** GIVEN two legitimate marker-DB `post_export_write_audit` rows and both named PONR triggers `O` WHEN cleanup succeeds or a real third-trigger delete bomb forces failure after disable THEN audit count+whole-table digest are identical before/after, both named triggers finish `O`, the unrelated trigger is untouched, and no trigger other than the two named ones was disabled. Failure restoration is verified, not inferred from source text.

- [ ] **AC-8 — early gate validation and complete lifecycle.** GIVEN a missing/malformed/equal gate/marker URL WHEN the human gate starts THEN it exits before any DB/control-plane/step mutation. GIVEN valid distinct targets WHEN C-3 runs with seeding enabled THEN pre-C3 cleanup proves a clean marker start and the EXIT trap proves marker count 0 plus audit/trigger preservation on normal success and forced C-3 failure. The original nonzero gate RC is preserved; cleanup failure turns an otherwise-zero run nonzero.

- [ ] **AC-9 — real two-database regression.** Tests use two simultaneously reachable, migrated PostgreSQL databases with distinct database names (not schemas, files, mocks, fake SQL clients, or sequentially swapped single DB). They seed contradictory PONR/audit state and prove explicit-target behavior, child propagation, mismatch refusal, marker cleanup, foreign-row refusal, equality refusal, and failure restoration.

- [ ] **AC-10 — legitimate nonprod preservation.** No implementation or verification command invokes the broad Sprint 30 ledger reset against `holocron_nonprod`/marker target. Task-commit evidence records the legitimate marker audit count and digest and proves the exact same values after every cleanup test. Any unexpected marker row blocks; it is never reclassified or deleted manually.

- [ ] **AC-11 — quality and task commit.** Targeted tests, shell syntax checks, TypeScript, formatting/lint, and all repository pre-commit hooks pass without bypass. The conventional implementation commit contains only WRITE-ALLOWED paths and no secrets/evidence credentials. Do not push, release, land to `main`, or touch Sprint 31; landing and final runtime/gate proof are orchestrator-owned closeout steps.

## RED-first scenario contracts

| ID | GIVEN | WHEN | THEN / negative control that gives the RED teeth |
|---|---|---|---|
| RED-1 split PONR | real DB A clean; real DB B has exact sentinel; ambient=B; explicit=A | pre-fix direct repoint and drill child path run | capture wrong-target failure/identity absence; test would fail if it uses one DB or removes contradictory row |
| RED-2 audit split | A audit empty; B contains accepted rows after watermark | drill bound A runs independent recompute | pre-fix reads B/ambient or lacks target identity; GREEN must recompute A=0; swap A/B must reverse result |
| RED-3 child inheritance | parent explicit=A; child supplied ambient=B | real child CLI runs | pre-fix report originates B; GREEN report originates A; test fails if child isn't actually spawned |
| RED-4 verify-tools leakage | two concurrent real verify calls use A and B while ambient is sentinel C | calls overlap | pre-fix ambient mutation is observable/cross-contaminates; GREEN preserves C and each DB oracle; test fails if calls are serial only |
| RED-5 mismatch | obtain real child report for B and parent identity A | production mismatch evaluator/finalizer runs | `DATABASE_TARGET_MISMATCH`; mutation `return true` must fail the test |
| RED-6 marker foreign row | one fixed marker field changed | cleanup runs | nonzero, row/digest/triggers preserved; test fails if predicate checks only surface/row id |
| RED-7 restoration | exact marker plus an enabled third trigger that raises on DELETE | cleanup disables the two named triggers and DELETE fails | both named triggers and bomb remain enabled; audit and marker survive; test fails if only happy path checks restoration |
| RED-8 early validation | alias-equal URLs and mutation canaries on gate DB | human gate starts | exits before canaries change; test fails if validation remains after step loop |
| RED-9 exit cleanup | valid distinct DBs, marker seed succeeds, later C-3 control forced nonzero | gate exits via failure path | trap removes exact marker, preserves original RC/audit/triggers; test fails if cleanup is success-path-only |

RED artifacts must record failing command, exit code, source SHA, two credential-free target identities, and the assertion that failed. A compile error from making the test call a nonexistent future API is not behavioral RED.

## Test Criteria

| ID | Statement | Maps to | Verification |
|---|---|---|---|
| TC-1 | Omitting required DB from three internal interfaces fails `tsc` fixture/type assertion | AC-1 | `pnpm exec tsc --noEmit` + `@ts-expect-error` type contract |
| TC-2 | Ambient marker PONR cannot block explicit clean gate repoint | AC-2, AC-9 | real two-DB integration test |
| TC-3 | Real PONR in explicit gate still yields its `POST_PONR_INELIGIBLE` id | AC-2 | real two-DB integration test |
| TC-4 | Child receives explicit parent DB despite supplied ambient marker DB | AC-3 | real `bun ... cutover:rollback-repoint --json` child report identity |
| TC-5 | Independent audit recompute reads explicit gate, not marker audit | AC-3 | contradictory A/B audit rows + drill report |
| TC-6 | `runVerifyTools` does not mutate ambient; overlapping calls remain isolated | AC-3 | concurrent integration test + ambient canary |
| TC-7 | Real B child report evaluated under A fails `DATABASE_TARGET_MISMATCH` before success | AC-4 | production-path mismatch test |
| TC-8 | Comparison-removal/inversion mutation makes TC-7 fail | AC-4 | committed mutation transcript under task evidence |
| TC-9 | Identity alias/equality/difference matrix is stable and contains no credentials | AC-5 | unit table + secret-canary scan of outputs |
| TC-10 | Exact marker deletes once; empty rerun is idempotent | AC-6 | real marker DB cleanup test |
| TC-11 | Each fixed identity field has a one-field foreign-row negative | AC-6 | table-driven real DB cases (all fixed fields, not a representative subset) |
| TC-12 | Marker multiplicity/foreign row deletes nothing | AC-6 | real DB negative where schema permits; otherwise foreign single-row case plus enforced singleton proof |
| TC-13 | Audit count+digest unchanged after success | AC-7, AC-10 | two distinctive legitimate rows before/after |
| TC-14 | Third-trigger delete failure restores both required triggers and preserves audit/marker | AC-7 | real bomb-trigger negative |
| TC-15 | No `DISABLE TRIGGER ALL/USER`; only exact two names appear in execution evidence | AC-7 | DB trigger state evidence + narrow static safeguard |
| TC-16 | Missing/malformed/alias-equal targets exit before mutation canaries | AC-8 | executed shell tests, not source grep alone |
| TC-17 | Normal and forced-failure C-3 paths run EXIT cleanup and preserve RC semantics | AC-8 | two shell process tests |
| TC-18 | Broad reset refuses marker identity and is never invoked against nonprod | AC-10 | command audit + canary audit rows |
| TC-19 | Targeted real integration and shell suites pass | AC-9, AC-11 | commands below |
| TC-20 | Full hooks pass; diff excludes Sprint 31 and contains no raw credentials | AC-11 | commit hook transcript + `git diff --name-only` + secret scan |

## Commands and verification order

### RED and targeted GREEN

```bash
# Scope census must match the WRITE-ALLOWED callers before edits begin.
rg -l 'runRollback(Repoint|Drill)\(' \
  services/platform/src services/platform/tests tests scripts | sort
rg -l 'spawnRollbackRepointCli\(' \
  services/platform/src services/platform/tests tests scripts | sort
rg -l 'runVerifyTools\(' \
  services/platform/src services/platform/tests tests scripts | sort

# Operator supplies two distinct real migrated DBs through env; never URL flags.
PLATFORM_IT=1 \
GATE_DATABASE_URL="$GATE_DATABASE_URL" \
MARKER_DATABASE_URL="$MARKER_DATABASE_URL" \
pnpm vitest run --project integration \
  services/platform/tests/integration/sprint30-explicit-ponr-database-binding.test.ts

pnpm vitest run tests/cutover/gate-fix-explicit-ponr-database-binding.test.ts
bash -n scripts/cleanup-sprint30-ponr-marker.sh \
  scripts/probe-ponr-role-immutability-negative-marker.sh \
  scripts/run-sprint30-human-gate.sh

PLATFORM_IT=1 DATABASE_URL="$GATE_DATABASE_URL" \
pnpm vitest run --project integration \
  services/platform/tests/integration/sprint29-rollback-repoint.test.ts \
  services/platform/tests/integration/sprint30-rollback-drill.test.ts \
  services/platform/tests/integration/sprint30-redhat-rh-s30.test.ts
```

Tests must provision/use distinct disposable database names or accept already provisioned distinct env targets. They must not reset the operator's shared `holocron_nonprod`; the live handoff marker is handled only by the exact cleanup command.

The cleanup wrapper may accept `--out` only. It must reject `--database-url`, `--marker-url`, and positional URL arguments.

### Task-commit quality

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
git diff --check
git diff --name-only 826e2ac9609138dff7341b7b95470568578a1abc...HEAD
```

Commit normally so every configured hook runs; never use `--no-verify`. Review/landing, `:44121` source-revision binding, and the fresh 5/5 human gate are orchestrator-owned Sprint closeout gates documented in `SPRINT.md`, not prerequisites for approving this task commit.

## Anti-stub and fakeability floor

- **NOT closed:** passing `databaseUrl` to one of PONR/audit/recompute while another still resolves ambient state.
- **NOT closed:** setting `process.env.DATABASE_URL` temporarily and restoring it; concurrent calls can still race.
- **NOT closed:** a child test that inspects constructed env without spawning the registered CLI and reading a real report.
- **NOT closed:** one Postgres DB with schemas, file fixtures, mocked `createSql`, mocked framework/core, fake reports only, or sequential env swaps presented as a two-DB test.
- **NOT closed:** comparing database name only; host and effective port are part of the target.
- **NOT closed:** fingerprint-only compare without field equality, or hashing/printing a raw credential-bearing URL.
- **NOT closed:** `DATABASE_TARGET_MISMATCH` tested only by calling a test-only function never used in drill acceptance. The production acceptance seam and mutation proof are required.
- **NOT closed:** marker deletion keyed only by `write_surface`, fixed row id, operator, or any subset of the full fixed identity.
- **NOT closed:** broad `TRUNCATE data_plane_ponr` or audit reset on `holocron_nonprod`, even if counts happen to return to prior values.
- **NOT closed:** source grep for trigger restoration without a real post-disable SQL failure.
- **NOT closed:** preserving audit count only; two rows can change content while count stays two. Count **and** stable content digest must match.
- **NOT closed:** `DISABLE TRIGGER ALL/USER`, disabling a third trigger, or treating missing/disabled required triggers as cleanup success.
- **NOT closed:** a cleanup trap registered after mutation, a trap that masks the original RC, or success-path-only cleanup.
- **NOT closed:** early-validation tests without mutation canaries proving steps/reset/fence did not run.
- **NOT closed:** evidence containing DB credentials, raw URLs, secret-bearing argv, or copied `.env`/`secrets.yaml` values.

Retain the existing `DRILL_FENCE_NOT_ARMED`, strict five-surface 423/rejection, zero-loss identity, GATE-META PONR bind, operator authorization, and post-PONR semantics; the task changes database binding and marker lifecycle only.

## Evidence manifest

All new evidence under `.tmp/GATE-FIX-explicit-ponr-database-binding/`; no secrets committed.

| Artifact | Proof |
|---|---|
| `red/split-target-repoint.json` | ambient marker vs explicit gate RED |
| `red/split-target-audit-recompute.json` | contradictory audit RED |
| `red/child-inheritance.json` | real child wrong-target RED |
| `red/run-verify-tools-ambient-race.json` | ambient mutation/cross-call RED |
| `green/two-database-integration.log` | real A/B suite |
| `green/database-target-mismatch.json` | fail-closed mismatch on real child report |
| `green/mutation-target-compare.log` | comparison mutation killed |
| `green/identity-redaction.json` | alias matrix and credential canary absence |
| `green/marker-cleanup-success.json` | exact success + idempotent no-op |
| `green/marker-foreign-matrix.json` | every fixed-field one-off rejected |
| `green/marker-delete-bomb.json` | failure restoration and audit/marker preservation |
| `green/gate-validation-before-mutation.json` | invalid/equal target canaries unchanged |
| `green/gate-exit-trap-success.json` | normal cleanup |
| `green/gate-exit-trap-failure.json` | forced-failure cleanup + RC preservation |
| `quality-gates.log` | targeted/full hooks pass |

## Handoff

After the orchestrator records a positive pre-dispatch causal disposition, dispatch `mastra-implementer`; require `mastra-reviewer`, `security-reviewer`, and `test-quality-reviewer` approval. This single implementation unit owns the atomic product + gate fix so the database contract cannot land without the marker lifecycle or vice versa. Reviewer approval is based on AC-1..AC-11 and task-commit evidence only; the orchestrator performs post-approval landing, deployment, and final gate closeout from `SPRINT.md`.

AGENT: implementer=mastra-implementer | proposed_by=mastra-planner | technical-reviewer=mastra-reviewer+security-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T00:00:00-06:00
finding_ids: [stale-nonprod-ponr, DATABASE_TARGET_MISMATCH, T-SYNC-013, T-SYNC-014, CAP-CUT-01, 20260808T024946Z]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-explicit-ponr-database-binding",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true,
    "requires_real_services": true,
    "requires_mutation_proof": true
  },
  "proposed_by": "mastra-planner",
  "agent": "mastra-implementer",
  "technical_reviewers": ["mastra-reviewer", "security-reviewer"],
  "standing_test_reality": "test-quality-reviewer",
  "severity": "CRITICAL",
  "touches_capabilities": ["CAP-CUT-01"],
  "prd_refs": ["UC-SYNC-04", "T-SYNC-013", "T-SYNC-014"],
  "source_handoff": "HANDOFF-20260808T0300Z-stale-nonprod-ponr.md",
  "source_gate_run_id": "20260808T024946Z",
  "planning_head": "826e2ac9609138dff7341b7b95470568578a1abc",
  "branch_discipline": "implementer task branch; independent review APPROVED before orchestrator landing; no push/release",
  "blocked_if": [
    "unexpected_marker_database_ponr_row",
    "marker_audit_count_or_digest_changes",
    "required_trigger_not_enabled_after_cleanup"
  ],
  "forbidden": [
    "broad_reset_on_holocron_nonprod_or_marker_database",
    "database_url_cli_flag",
    "credential_or_raw_database_url_output",
    "ambient_database_fallback_inside_rollback_core",
    "process_env_database_url_mutation_in_runVerifyTools",
    "mock_or_single_database_claimed_as_two_database_proof",
    "touch_sprint_31",
    "skip_commit_hooks"
  ],
  "database_target_identity": {
    "fields": ["host", "effective_port", "database", "fingerprint"],
    "credential_free": true,
    "effective_default_port": 5432,
    "fingerprint": "sha256(versioned NUL-delimited host, effective port, database)",
    "compare": "all fields plus fingerprint"
  },
  "synthetic_marker_identity_fields": [
    "write_surface=probe.seed",
    "write_table=documents",
    "write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa",
    "write_row_digest_sha256=abababababababababababababababababababababababababababababababab",
    "base_url=http://127.0.0.1:9",
    "operator=probe-seed",
    "run_id=s30-marker-miss-seed",
    "idempotency_key=s30-marker-miss-seed-idem",
    "convex_fence_audit_id=seed",
    "convex_fence_env_value=1",
    "convex_documents_total=0",
    "convex_newest_document_creation_time=0",
    "convex_accepted_writes_since_watermark=0",
    "convex_rejected_writes_since_watermark=0"
  ],
  "required_triggers": [
    "data_plane_ponr_reject_mutation",
    "data_plane_ponr_reject_truncate"
  ],
  "fixtures": {
    "two_real_databases": {"description": "two simultaneously reachable real migrated PostgreSQL databases A and B with distinct database names and contradictory PONR/audit state", "seed_method": "migration_fixture"},
    "real_child_cli": {"description": "registered cutover:rollback-repoint CLI spawned as a real child against database A while ambient state names database B", "seed_method": "cli"},
    "marker_database": {"description": "real marker PostgreSQL database with exact/foreign PONR variants, two legitimate audit rows, and named trigger states", "seed_method": "migration_fixture"},
    "human_gate": {"description": "real scripts/run-sprint30-human-gate.sh process with gate/marker targets and mutation/exit canaries", "seed_method": "cli"}
  },
  "scenarios": [
    {
      "id": "RED-1-split-ponr",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "real migrated database A has data_plane_ponr count `0`; simultaneous real database B has the exact `probe.seed` row; ambient target is B and explicit target is A", "seed_method": "migration_fixture"},
      "action": {"steps": ["run the production runRollbackRepoint and drill-child path with explicit database A"]},
      "end_state": {"must_observe": ["report database_target.database equals database `A`", "`POST_PONR_INELIGIBLE` is absent for A with PONR count `0`"], "must_not_observe": ["empty database target identity or `POST_PONR_INELIGIBLE` sourced from database B"]},
      "negative_control": {"would_fail_if": ["database B is removed so the test uses only one database", "the contradictory `probe.seed` row is omitted"]},
      "evidence": {"artifact_type": "db_query"}
    },
    {
      "id": "RED-2-audit-split",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "real database A has accepted_writes count `0`; simultaneous real database B has accepted_writes count `2`; ambient target is B and drill target is A", "seed_method": "migration_fixture"},
      "action": {"steps": ["run the production drill independent audit recomputation for database A"]},
      "end_state": {"must_observe": ["drill recomputed accepted_writes count is `0` for database A", "database B accepted_writes count remains `2`"], "must_not_observe": ["empty recompute identity or accepted_writes count `2` attributed to database A"]},
      "negative_control": {"would_fail_if": ["the second database is removed", "audit recomputation is stubbed with constant `0`"]},
      "evidence": {"artifact_type": "db_query"}
    },
    {
      "id": "RED-3-child-inheritance",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "parent explicit target is real database A while supplied child ambient DATABASE_URL names simultaneous real database B", "seed_method": "migration_fixture"},
      "action": {"steps": ["spawn the registered cutover:rollback-repoint CLI and parse its real JSON report"]},
      "end_state": {"must_observe": ["child database_target equals all `4` parent identity fields", "child target database equals database `A`"], "must_not_observe": ["empty child report or child target database B"]},
      "negative_control": {"would_fail_if": ["the real child process is removed and only constructed env is inspected", "child DATABASE_URL override is omitted"]},
      "evidence": {"artifact_type": "stdout"}
    },
    {
      "id": "RED-4-verify-tools-leakage",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "two overlapping real runVerifyTools calls target databases A and B while ambient DATABASE_URL is sentinel database C", "seed_method": "migration_fixture"},
      "action": {"steps": ["hold both calls across their database reads and release them concurrently"]},
      "end_state": {"must_observe": ["ambient DATABASE_URL remains sentinel database `C`", "each of the `2` calls reports its own A/B database identity"], "must_not_observe": ["empty call identity or ambient DATABASE_URL changed from sentinel C"]},
      "negative_control": {"would_fail_if": ["concurrency is removed and the calls are made serially", "the ambient-state assertion is omitted"]},
      "evidence": {"artifact_type": "event_log"}
    },
    {
      "id": "RED-5-target-mismatch",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "a genuine successful child report is produced by real database B and parent drill identity is real database A", "seed_method": "cli"},
      "action": {"steps": ["run the production drill acceptance seam with the B report under parent A"]},
      "end_state": {"must_observe": ["error.code equals `DATABASE_TARGET_MISMATCH`", "ok is `false` and repointed is `false`"], "must_not_observe": ["empty error code or ok `true`"]},
      "negative_control": {"would_fail_if": ["the production comparison is removed or inverted", "the B child report is replaced by a mock"]},
      "evidence": {"artifact_type": "file_artifact"}
    },
    {
      "id": "RED-6-marker-foreign-row",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "real marker database contains one PONR row with exactly `1` fixed synthetic identity field changed and two legitimate audit rows", "seed_method": "migration_fixture"},
      "action": {"steps": ["run the exact cleanup operation against distinct validated gate and marker targets"]},
      "end_state": {"must_observe": ["cleanup exit code is nonzero `!=0`", "PONR row count remains `1` and audit row count remains `2`"], "must_not_observe": ["empty PONR table or delete_count `1`"]},
      "negative_control": {"would_fail_if": ["the changed field is omitted from the delete predicate", "the foreign row is removed before cleanup"]},
      "evidence": {"artifact_type": "db_query"}
    },
    {
      "id": "RED-7-restoration",
      "primary": true,
      "test_tier": "integration",
      "topology": "single-node",
      "start_state": {"description": "real marker database has one exact marker, both required triggers `O`, two audit rows, and an enabled third trigger that raises on DELETE", "seed_method": "migration_fixture"},
      "action": {"steps": ["run cleanup through the real post-disable DELETE failure path"]},
      "end_state": {"must_observe": ["both named triggers and the third trigger finish `O`", "marker count is `1`; audit count is `2`; before/after audit digest is equal"], "must_not_observe": ["empty trigger state or any named trigger disabled after failure"]},
      "negative_control": {"would_fail_if": ["the third trigger is removed", "finally restoration or enabled-state verification is omitted"]},
      "evidence": {"artifact_type": "db_query"}
    },
    {
      "id": "RED-8-early-validation",
      "primary": true,
      "test_tier": "e2e",
      "topology": "single-node",
      "start_state": {"description": "gate and marker URLs are canonical aliases of the same database and mutation canaries record gate reset, fence, and step counts as `0`", "seed_method": "cli"},
      "action": {"steps": ["start scripts/run-sprint30-human-gate.sh with the alias-equal targets"]},
      "end_state": {"must_observe": ["gate exit code is nonzero `!=0`", "all `3` mutation canary counts remain `0`"], "must_not_observe": ["empty canary set or gate step `1` started"]},
      "negative_control": {"would_fail_if": ["target validation is moved after reset/steps", "the mutation canaries are omitted"]},
      "evidence": {"artifact_type": "event_log"}
    },
    {
      "id": "RED-9-exit-cleanup",
      "primary": true,
      "test_tier": "e2e",
      "topology": "single-node",
      "start_state": {"description": "distinct real gate/marker databases, marker seeding succeeds, and a later C-3 control exits with forced code `37`", "seed_method": "cli"},
      "action": {"steps": ["run the human gate through the forced C-3 failure and EXIT trap"]},
      "end_state": {"must_observe": ["final process exit code remains `37`", "marker count is `0`; both named triggers are `O`; audit digest is unchanged"], "must_not_observe": ["empty cleanup report or residual marker count `1`"]},
      "negative_control": {"would_fail_if": ["the EXIT trap is removed", "cleanup is wired to success path only"]},
      "evidence": {"artifact_type": "event_log"}
    }
  ],
  "requirements": [
    {
      "id":"AC-1", "type":"acceptance_criterion", "description":"Rollback repoint, drill, and child interfaces require explicit databaseUrl; CLI resolves once; no URL flag", "verify":"typecheck and direct caller audit",
      "scenario": {"id":"AC-1-required-database", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"two_real_databases", "action":{"steps":["compile omission assertions and invoke both registered CLI boundaries with DATABASE_URL naming A"]}, "end_state":{"must_observe":["all `3` internal interfaces reject omitted databaseUrl at typecheck", "both CLI reports identify database `A` without a URL flag"], "must_not_observe":["empty target identity, an accepted omitted argument, or `--database-url`"]}, "negative_control":{"would_fail_if":["the required property is made optional", "CLI-to-core propagation is removed"]}, "evidence":{"artifact_type":"stdout"}}
    },
    {
      "id":"AC-2", "type":"acceptance_criterion", "description":"PONR and audit reads use the explicit target under contradictory ambient state", "verify":"real two-database integration",
      "scenario": {"id":"AC-2-explicit-ponr-audit", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"two_real_databases", "action":{"steps":["set ambient target B, pass explicit target A, and run production repoint twice with A clean then A containing one real PONR"]}, "end_state":{"must_observe":["clean-A run has no `POST_PONR_INELIGIBLE` and reports target `A`", "A-PONR run returns `POST_PONR_INELIGIBLE` for exactly `1` A row"], "must_not_observe":["empty target identity or B sentinel attributed to A"]}, "negative_control":{"would_fail_if":["database B is removed", "explicit databaseUrl is omitted from either PONR or audit load"]}, "evidence":{"artifact_type":"db_query"}}
    },
    {
      "id":"AC-3", "type":"acceptance_criterion", "description":"Child, probes, verify-tools, and audit recompute use parent target without process.env mutation", "verify":"real child and concurrent verify tests",
      "scenario": {"id":"AC-3-child-recompute-isolation", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"real_child_cli", "action":{"steps":["run the real drill child and contradictory audit recompute for A while overlapping A/B verify-tools calls preserve ambient sentinel C"]}, "end_state":{"must_observe":["child matches all `4` parent identity fields", "recomputed accepted count is A value `0`; ambient remains `C`; both overlapping calls retain their A/B identities"], "must_not_observe":["empty child identity, B audit count `2` attributed to A, or changed ambient sentinel"]}, "negative_control":{"would_fail_if":["the child process is replaced by a mock", "recompute databaseUrl or the concurrency assertion is omitted"]}, "evidence":{"artifact_type":"event_log"}}
    },
    {
      "id":"AC-4", "type":"acceptance_criterion", "description":"Unequal/missing child identity fails DATABASE_TARGET_MISMATCH before acceptance; mutation killed", "verify":"mismatch + mutation artifacts",
      "scenario": {"id":"AC-4-target-mismatch", "primary":true, "test_tier":"integration", "topology":"single-node", "start_state":{"description":"genuine successful child report from real database B and parent drill identity from real database A", "seed_method":"cli"}, "action":{"steps":["run the production drill acceptance seam, then repeat with the target comparison removed/inverted"]}, "end_state":{"must_observe":["baseline returns `DATABASE_TARGET_MISMATCH`, ok `false`, repointed `false`", "comparison mutation makes the test exit nonzero `!=0`"], "must_not_observe":["empty error code or accepted ok `true` under unequal targets"]}, "negative_control":{"would_fail_if":["the B report is replaced by a mock", "the production comparison is removed"]}, "evidence":{"artifact_type":"file_artifact"}}
    },
    {
      "id":"AC-5", "type":"acceptance_criterion", "description":"Credential-free stable host/effective-port/database/fingerprint identity and secret canary absence", "verify":"identity matrix + output scan",
      "scenario": {"id":"AC-5-credential-free-identity", "primary":true, "test_tier":"unit", "unit_test_justified":"pure URL normalization and redaction matrix has no I/O seam", "topology":"single-node", "start_state":{"description":"PostgreSQL URL matrix varies scheme alias, credential canaries, host case, omitted/explicit `5432`, database, query, and fragment", "seed_method":"cli"}, "action":{"steps":["derive and compare DatabaseTargetIdentity for every matrix pair and scan serialized output"]}, "end_state":{"must_observe":["alias-equivalent pairs match all `4` fields", "host/port/database differences are unequal and secret-canary match count is `0`"], "must_not_observe":["empty identity, raw URL, username, password, query, or fragment"]}, "negative_control":{"would_fail_if":["effective-port normalization is removed", "credential redaction assertion is omitted"]}, "evidence":{"artifact_type":"stdout"}}
    },
    {
      "id":"AC-6", "type":"acceptance_criterion", "description":"Cleanup deletes only zero/one exact full-identity marker and rejects all foreign shapes", "verify":"real marker database matrix",
      "scenario": {"id":"AC-6-exact-marker-only", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"marker_database", "action":{"steps":["run cleanup for zero rows, one exact row, every one-field foreign row, and unexpected multiplicity"]}, "end_state":{"must_observe":["zero-row delete_count is `0`; exact-row delete_count is `1`", "every foreign/multiple case exits nonzero `!=0` with its original row count"], "must_not_observe":["empty table after a foreign case or delete_count `1` for a partial match"]}, "negative_control":{"would_fail_if":["any fixed identity predicate is omitted", "foreign cases are removed"]}, "evidence":{"artifact_type":"db_query"}}
    },
    {
      "id":"AC-7", "type":"acceptance_criterion", "description":"Only two named triggers are disabled/restored and audit count+digest survives success/failure", "verify":"success and bomb-trigger real DB tests",
      "scenario": {"id":"AC-7-trigger-audit-restoration", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"marker_database", "action":{"steps":["run exact cleanup successfully, then rerun with an enabled third trigger that raises after the two named triggers are disabled"]}, "end_state":{"must_observe":["before/after audit count is `2` and digest equality is true", "all `3` triggers finish `O`; only the `2` named triggers appear in disable evidence"], "must_not_observe":["empty trigger state, disabled required trigger, or changed audit digest"]}, "negative_control":{"would_fail_if":["the delete-bomb trigger is removed", "finally enabled-state verification is omitted"]}, "evidence":{"artifact_type":"db_query"}}
    },
    {
      "id":"AC-8", "type":"acceptance_criterion", "description":"Gate validates before mutation and cleans pre-C3 plus EXIT on success/failure with RC preservation", "verify":"executed shell process tests",
      "scenario": {"id":"AC-8-gate-order-and-trap", "primary":true, "test_tier":"e2e", "topology":"single-node", "start_ref":"human_gate", "action":{"steps":["run alias-equal target rejection, normal seeded C-3, forced C-3 exit `37`, and cleanup-failure after otherwise-successful main work"]}, "end_state":{"must_observe":["bad-target mutation canary counts remain `0`", "forced main RC remains `37`; normal final marker count is `0`; cleanup failure changes main RC `0` to nonzero"], "must_not_observe":["empty cleanup report, step `1` on invalid targets, or residual marker count `1`"]}, "negative_control":{"would_fail_if":["validation is moved after reset", "the EXIT trap or original-RC assertion is removed"]}, "evidence":{"artifact_type":"event_log"}}
    },
    {"id":"AC-9", "type":"acceptance_criterion", "description":"Regression suite uses two simultaneous real migrated PostgreSQL databases", "verify":"PLATFORM_IT integration transcript", "scenario_justification":"nonbehavioral test-topology constraint audited through AC-2/AC-3 scenarios and TC-19 rather than a duplicate scenario"},
    {
      "id":"AC-10", "type":"acceptance_criterion", "description":"Legitimate marker/nonprod audit rows preserved; broad reset never targets marker", "verify":"audit count+digest and command audit",
      "scenario": {"id":"AC-10-no-marker-reset", "primary":true, "test_tier":"integration", "topology":"single-node", "start_ref":"marker_database", "action":{"steps":["exercise cleanup and gate-reset dispatch with marker identity while two distinctive legitimate audit rows remain"]}, "end_state":{"must_observe":["marker audit count stays `2` with identical before/after digest", "broad reset marker invocation count is `0` and identity refusal exit is nonzero `!=0`"], "must_not_observe":["empty audit table, changed digest, or marker broad-reset count `1`"]}, "negative_control":{"would_fail_if":["marker identity guard is removed", "audit digest assertion is omitted"]}, "evidence":{"artifact_type":"db_query"}}
    },
    {"id":"AC-11", "type":"acceptance_criterion", "description":"All quality hooks pass; conventional task commit only; no Sprint31/push/release/landing", "verify":"quality and scoped git artifacts", "scenario_justification":"nonbehavioral repository quality/authorization boundary verified by hooks, scoped diff, commit metadata, and orchestrator review"}
  ],
  "test_criteria": [
    {"id":"TC-1","maps_to_ac":"AC-1","description":"required databaseUrl type contract"},
    {"id":"TC-2","maps_to_ac":"AC-2","description":"ambient marker cannot block explicit clean gate"},
    {"id":"TC-3","maps_to_ac":"AC-2","description":"explicit gate PONR still refuses"},
    {"id":"TC-4","maps_to_ac":"AC-3","description":"real child receives explicit parent target"},
    {"id":"TC-5","maps_to_ac":"AC-3","description":"independent audit recompute uses gate target"},
    {"id":"TC-6","maps_to_ac":"AC-3","description":"concurrent verify-tools calls do not mutate ambient"},
    {"id":"TC-7","maps_to_ac":"AC-4","description":"real B report under A fails mismatch"},
    {"id":"TC-8","maps_to_ac":"AC-4","description":"target comparison mutation killed"},
    {"id":"TC-9","maps_to_ac":"AC-5","description":"identity alias/difference/redaction matrix"},
    {"id":"TC-10","maps_to_ac":"AC-6","description":"exact delete and idempotent zero"},
    {"id":"TC-11","maps_to_ac":"AC-6","description":"every fixed identity field one-off rejected"},
    {"id":"TC-12","maps_to_ac":"AC-6","description":"foreign/multiple rows delete nothing"},
    {"id":"TC-13","maps_to_ac":"AC-7","description":"audit count+digest success preservation"},
    {"id":"TC-14","maps_to_ac":"AC-7","description":"delete bomb restores triggers and preserves rows"},
    {"id":"TC-15","maps_to_ac":"AC-7","description":"only exact two trigger names disabled"},
    {"id":"TC-16","maps_to_ac":"AC-8","description":"bad/equal targets stop before mutation canaries"},
    {"id":"TC-17","maps_to_ac":"AC-8","description":"normal and forced-failure EXIT cleanup"},
    {"id":"TC-18","maps_to_ac":"AC-10","description":"broad reset absent/refused for marker"},
    {"id":"TC-19","maps_to_ac":"AC-9","description":"targeted real integration and shell suites"},
    {"id":"TC-20","maps_to_ac":"AC-11","description":"full hooks, scoped diff, secret scan"}
  ]
}
-->
