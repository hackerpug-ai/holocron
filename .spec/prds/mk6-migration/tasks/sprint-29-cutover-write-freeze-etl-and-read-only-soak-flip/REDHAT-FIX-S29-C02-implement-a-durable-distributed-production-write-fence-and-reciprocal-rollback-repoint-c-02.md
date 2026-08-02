# REDHAT-FIX-S29-C02 — Implement a durable distributed production write fence and reciprocal rollback repoint (C-02; soak-fence.ts:53-67,302-321)

## What this does

Close red-hat C-02 by replacing the process-local cutover:flip fence mutation with a durable, distributed production write of HOLO_MIGRATION_READ_ONLY that every serving process observes, and by defining the reciprocal config repoint to frozen Convex as the UC-SYNC-04 rollback action.

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-C02). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-010, UC-SYNC-04, CAP-CUT-01. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-red.log`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts`
- `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/cli/holo.ts && pnpm tsgo --noEmit`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY durable flip + process generation recording + rollback-repoint helpers, services/platform/src/cli/holo.ts — MODIFY cutover:flip behavior; ADD cutover:rollback-repoint (or --rollback), services/platform/src/config/secrets.ts — MODIFY only if needed to persist/read HOLO_MIGRATION_READ_ONLY control key safely, services/platform/src/stack/supervisor.ts and/or services/platform/src/stack/launchd.ts — MODIFY restart/reload hooks for generations, services/platform/config/secrets.example.yaml — MODIFY document HOLO_MIGRATION_READ_ONLY optional key (placeholder only), services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY/extend C-02 cases, services/platform/tests/integration/redhat-fix-s29-c02-durable-fence.test.ts — NEW if suite split preferred, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence

Prohibited: app/, components/, hooks/, screens/ — RN flip Sprint 24, convex/** deletion — Convex stays live for rollback, services/platform/src/db/migrations/ — no Postgres fence table, services/platform/src/queue/durable-effect.ts — fence remains at runJob(), Re-scoping C-01 go/no-go gate oracles (separate task REDHAT-FIX-S29-C01), Re-implementing Convex quiet/drain (C-03)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-C02 — Implement a durable distributed production write fence and reciprocal rollback repoint (C-02; soak-fence.ts:53-67,302-321)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01, CAP-MIG-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
After green ETL, cutover:flip durably engages HOLO_MIGRATION_READ_ONLY=1 at the control plane, reloads/restarts serving generations, proves cross-process write blocks without client env inject, and exposes cutover:rollback-repoint that writes Convex data-plane repoint config with auditable report artifacts.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST preserve the pinned D06-01/D06-05 fence contract: enforcement remains HOLO_MIGRATION_READ_ONLY=='1' (or 'true') checked fresh via isMigrationReadOnly() at every write chokepoint (Hono middleware, MCP executor, queue runJob) — no second Postgres table fence, no alternate rejection codes
- MUST make cutover:flip write HOLO_MIGRATION_READ_ONLY=1 to an authoritative durable control-plane target (services/platform/config/secrets.yaml and/or launchd EnvironmentVariables / stack supervisor config that every serving process loads) — not only process.env of the CLI process and not only .tmp/D06-05/soak-state.json
- MUST either (a) restart or reload every serving Hono/MCP/worker generation so they observe the durable value, or (b) make isMigrationReadOnly() re-read the durable control-plane source on every call after overlaying into the process env bag — and prove the chosen path with process-generation evidence
- MUST record in flip-report.json: configured_target (absolute path or labeled control-plane id), env_value '1', engaged_at ISO timestamp, process_generations before/after (pid and/or launchd instance ids for mastra/hono/scheduler or documented serving units), etl_run_id from green D06-04 reconciliation
- MUST prove a cross-process blocked write: a client process that does NOT set HOLO_MIGRATION_READ_ONLY itself still receives HTTP 423 + body error==migration_read_only AND code==migration_read_only against the already-running server after flip, with documents row count unchanged
- MUST implement an executable reciprocal rollback action (cutover:rollback-repoint or cutover:flip --rollback) that writes config re-pointing the data plane to frozen Convex (Convex deployment stays live/un-deleted) and records rollback_report.json with action, target, engaged_at, and precondition status
- MUST refuse flip when D06-04 reconciliation is not green (unexplainedVariance!=0) — preserve existing ETL_NOT_RECONCILED fail-closed path
- MUST keep rejection shapes: Hono 423 dual-key body; MCP Error('MIGRATION_READ_ONLY: ...'); queue {ok:false, error:'migration_read_only: ...'}
- MUST capture RED evidence first proving current HEAD fence is process-local only (flip does not change durable secrets/control-plane; cross-process write without env inject succeeds or is unproven)
- MUST extend/replace sprint29-soak-flip integration coverage so green asserts durable write + process generations + cross-process block — not setMigrationReadOnlyEnv alone
- NEVER claim durability solely via .tmp/D06-05/soak-state.json or flip-report.json when no serving process loads those files
- NEVER introduce a second fencing mechanism (Postgres cutover_soak table, Redis flag, etc.) that replaces HOLO_MIGRATION_READ_ONLY
- NEVER prove the fence only by injecting HOLO_MIGRATION_READ_ONLY=1 into the gate/test client process (gate-plan.json:75-80 anti-pattern)
- NEVER leave rollback as documentation-only — UC-SYNC-04 requires an executable config repoint to frozen Convex during soak
- NEVER touch app/, components/, hooks/, screens/ for RN flip (Sprint 24) or delete convex/ (post-soak Sprint 30+)
- NEVER accept a green flip when serving process generations are unchanged AND env was never reloaded from durable source
- STRICTLY tdd_mode red_first with red log at .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-red.log
- STRICTLY test_tier integration/e2e on PRIMARY ACs; topology single-node; verification_service hono+mcp+queue control-plane
- STRICTLY HOLO_MIGRATION_READ_ONLY remains reversible without code deletion (set 0 / remove key + reload/restart) — Sprint 30 owns full rollback drill exercise
- STRICTLY secrets.yaml values are never committed; tests use a disposable secrets path via HOLO_SECRETS_PATH / HOLOCRON_SECRETS_PATH
- STRICTLY preserve D06-05 zeroWritePath.status=='NOT_LANDED' aggregate honesty if verify-soak is touched

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN etl_reconciled_green WHEN operator runs holo cutover:flip --json against a dispos...
- [ ] AC-2: GIVEN running_serving_process WHEN cutover:flip completes and operator issues write fro...
- [ ] AC-3: GIVEN soak_fence_durably_engaged WHEN operator runs cutover:rollback-repoint --json THE...
- [ ] AC-4: GIVEN variance_gt_zero_etl_fixture WHEN cutover:flip attempted; suite rejects process-l...
- [ ] AC-5: GIVEN pre_fix_head_process_local_fence WHEN implementer completes C-02 THEN red and gre...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Durable control-plane write on cutover:flip (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN etl_reconciled_green WHEN operator runs holo cutover:flip --json against a disposable HOLO_SECRETS_PATH control plane THEN durable control-plane stores HOLO_MIGRATION_READ_ONLY=1; flip-report records configured_target, engaged_at, etl_run_id
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: control-plane + cutover CLI
  VERIFY: `HOLO_SECRETS_PATH=$TMP/secrets.yaml bun services/platform/src/cli/holo.ts cutover:flip --json; jq -e '.ok==true and (.configured_target|length)>0 and (.engaged_at|test("^[0-9]{4}-")) and (.etl_run_id|length)>0' .tmp/D06-05/flip-report.json; rg -n "HOLO_MIGRATION_READ_ONLY[: ]+['\"]?1" "$TMP/secrets.yaml"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub — only process.env[HOLO_MIGRATION_READ_ONLY]='1' without durable file write (soak-fence.ts:58-67,263-269); empty — configured_target missing/empty; soak-state.json is the only artifact under .tmp; static — flip-report ok true without inspecting control-plane file contents; mock — secrets path never opened; test asserts only in-process isMigrationReadOnly()
  START_REF: etl_reconciled_green
  MUST_OBSERVE: flip-report.ok === true; flip-report.env_value === '1' OR control-plane HOLO_MIGRATION_READ_ONLY === '1'; flip-report.configured_target is a non-empty string (absolute path or labeled control-plane id length >= 8); flip-report.engaged_at matches /^\d{4}-\d{2}-\d{2}T/; flip-report.etl_run_id is a non-empty string; control-plane file after flip contains HOLO_MIGRATION_READ_ONLY set to literal 1 (match count >= 1)
  MUST_NOT_OBSERVE: empty/start signature: only process.env mutated with no control-plane file change; configured_target empty or none; engaged_at empty or none; flip ok while unexplainedVariance fixture would have been >0 (precondition bypass)
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Process generations + cross-process fence without client env inject (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN running_serving_process WHEN cutover:flip completes and operator issues write from a clean-env client THEN process generations proven; cross-process write blocked without client env inject
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: hono serving process
  VERIFY: `jq -e '.process_generations.before and .process_generations.after' .tmp/D06-05/flip-report.json; env -u HOLO_MIGRATION_READ_ONLY curl -sS -o /tmp/c02-write.json -w '%{http_code}' -X POST "$PLATFORM_URL/api/documents" -H "authorization: Bearer $HOLO_KEY_RN" -H 'content-type: application/json' -d '{"title":"c02","content":"x"}'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if disconnect — fence only proven inside the same Node process that called setMigrationReadOnlyEnv; stub — gate injects HOLO_MIGRATION_READ_ONLY=1 into the client (gate-plan.json:75-80); empty — process_generations omitted; PIDs identical with no reload claim and no durable re-read proof; static — only asserts isMigrationReadOnly() true in CLI process
  START_REF: running_serving_process
  MUST_OBSERVE: flip-report.process_generations.before is a non-empty object or array with at least one serving unit id; flip-report.process_generations.after is a non-empty object or array with at least one serving unit id; either after generation differs from before for >=1 unit OR flip-report documents durable_reread==true with evidence the serving process re-read control-plane after flip; HTTP status of clean-env POST equals the literal 423; response body.error equals the literal string 'migration_read_only'; response body.code equals the literal string 'migration_read_only'
  MUST_NOT_OBSERVE: empty/start signature: HTTP 201 from clean-env POST after flip; documents row count increases (N -> N+1); proof relies on client process.env.HOLO_MIGRATION_READ_ONLY==='1'; process_generations.before and after both empty
  EVIDENCE: api_response (required_capture=True)

### AC-3 — Reciprocal rollback repoint to frozen Convex (flow_ref UC-SYNC-04)
  GIVEN/WHEN/THEN: GIVEN soak_fence_durably_engaged WHEN operator runs cutover:rollback-repoint --json THEN auditable config repoint to frozen Convex is written
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: control-plane
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json; jq -e '.ok==true and (.target|length)>0 and (.engaged_at|test("^[0-9]{4}-")) and (.data_plane=="convex" or .target_kind=="convex")' .tmp/D06-05/rollback-report.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub — markdown-only rollback note without CLI action; empty — rollback_report missing target/engaged_at; static — only asserts convex/ directory still exists without config write; mock — report fabricated without writing control-plane repoint keys
  START_REF: soak_fence_durably_engaged
  MUST_OBSERVE: rollback_report.ok === true; rollback_report.target is a non-empty string identifying frozen Convex; rollback_report.engaged_at matches /^\d{4}-\d{2}-\d{2}T/; rollback_report.data_plane === 'convex' OR rollback_report.target_kind === 'convex'; convex/ directory still exists after rollback-repoint (path exists == true)
  MUST_NOT_OBSERVE: empty/start signature: no CLI command registered for rollback-repoint; rollback_report.target empty or none; convex/ tree deleted as part of this task; rollback claims success without writing any control-plane artifact
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Flip still fail-closed on unreconciled ETL; process-local-only path is insufficient (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN variance_gt_zero_etl_fixture WHEN cutover:flip attempted; suite rejects process-local-only green THEN unreconciled flip refused; process-local-only insufficient
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: cutover CLI + vitest
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:flip --json; test $? -ne 0; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'REDHAT-FIX-S29-C02|durable|cross-process'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if flip succeeds (exit 0) against unexplainedVariance>0; suite greens solely by setMigrationReadOnlyEnv without durable write assertion; empty — no negative control case in suite
  START_REF: variance_gt_zero_etl_fixture
  MUST_OBSERVE: flip process exit code != 0 against variance>0 fixture; flip-report.error.code is a non-empty string (e.g. ETL_NOT_RECONCILED); C-02 integration suite exit code == 0 only when durable write + cross-process assertions pass
  MUST_NOT_OBSERVE: empty/start signature: flip exit 0 with unexplainedVariance>0; suite pass based only on in-process setMigrationReadOnlyEnv('1'); durable control-plane written to 1 on failed flip
  EVIDENCE: stdout (required_capture=True)

### AC-5 — TDD red→green evidence chain for C-02 (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_head_process_local_fence WHEN implementer completes C-02 THEN red and green evidence chain present
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: tdd evidence files
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-red.log && test -f .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-path.json && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if empty — no red log; stub — green claimed without red phase; mock — fabricated path.json without suite evidence
  START_REF: pre_fix_head_process_local_fence
  MUST_OBSERVE: redhat-fix-s29-c02-red.log exists and file size > 0; path.json path field equals 'A'; path.json agent equals 'devops-engineer'; at least one green evidence file under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/ with size > 0
  MUST_NOT_OBSERVE: empty/start signature: only green logs without red evidence; path.json agent equals 'mastra-implementer' without agent_rationale amendment (disallowed — implementer is devops-engineer)
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | cutover:flip writes HOLO_MIGRATION_READ_ONLY=1 to durable control-plane (secr... | AC-1 | `rg -n "HOLO_MIGRATION_READ_ONLY" "$HOLO_SECRETS_PATH"; jq .configured_target .tmp/D06-0...` |
| TC-2 | flip-report includes process_generations before/after for serving units | AC-2 | `jq -e '.process_generations.before and .process_generations.after' .tmp/D06-05/flip-rep...` |
| TC-3 | clean-env client POST /api/documents returns 423 dual-key migration_read_only... | AC-2 | `env -u HOLO_MIGRATION_READ_ONLY curl -i -X POST "$PLATFORM_URL/api/documents" ...` |
| TC-4 | documents row count unchanged across blocked cross-process write | AC-2 | `compare SELECT count(*) FROM documents before/after POST` |
| TC-5 | cutover:rollback-repoint writes rollback_report with Convex target | AC-3 | `jq -e '.ok==true and (.target\|length)>0' .tmp/D06-05/rollback-report.json` |
| TC-6 | flip exits non-zero when unexplainedVariance>0 | AC-4 | `holo cutover:flip against variance>0 fixture; echo $?` |
| TC-7 | RED evidence log non-empty for process-local-only HEAD behavior | AC-5 | `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-...` |
| TC-8 | MCP and queue chokepoints still observe fence after durable engage (jobs-runn... | AC-2 | `invoke one MCP mutation tool and one runJob write job; assert MIGRATION_READ_ONLY / mig...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY durable flip + process generation recording + rollback-repoint helpers
- services/platform/src/cli/holo.ts — MODIFY cutover:flip behavior; ADD cutover:rollback-repoint (or --rollback)
- services/platform/src/config/secrets.ts — MODIFY only if needed to persist/read HOLO_MIGRATION_READ_ONLY control key safely
- services/platform/src/stack/supervisor.ts and/or services/platform/src/stack/launchd.ts — MODIFY restart/reload hooks for generations
- services/platform/config/secrets.example.yaml — MODIFY document HOLO_MIGRATION_READ_ONLY optional key (placeholder only)
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY/extend C-02 cases
- services/platform/tests/integration/redhat-fix-s29-c02-durable-fence.test.ts — NEW if suite split preferred
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence
writeProhibited:
- app/, components/, hooks/, screens/ — RN flip Sprint 24
- convex/** deletion — Convex stays live for rollback
- services/platform/src/db/migrations/ — no Postgres fence table
- services/platform/src/queue/durable-effect.ts — fence remains at runJob()
- Re-scoping C-01 go/no-go gate oracles (separate task REDHAT-FIX-S29-C01)
- Re-implementing Convex quiet/drain (C-03)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:59-66 — C-02 CRITICAL finding + remediation
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:41 — D06-05 AC-1 FAIL matrix (process.env only)
3. services/platform/src/cutover/soak-fence.ts:53-67 — isMigrationReadOnly + setMigrationReadOnlyEnv process-local
4. services/platform/src/cutover/soak-fence.ts:263-269 — runFlip setMigrationReadOnlyEnv('1') only
5. services/platform/src/cutover/soak-fence.ts:302-321 — flip-report.json + soak-state.json under .tmp
6. services/platform/src/queue/jobs-runner.ts:72-84 — runJob fence reads process-local isMigrationReadOnly
7. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:75-80 — gate injects HOLO_MIGRATION_READ_ONLY=1 into fresh process
8. .spec/prds/mk6-migration/08-uc-sync.md:46-58 — UC-SYNC-03 read-only soak boundary
9. .spec/prds/mk6-migration/08-uc-sync.md:56-62 — UC-SYNC-04 rollback repoint to frozen Convex
10. services/platform/src/config/secrets.ts:1-30,192-210 — secrets overlay / control-plane load order
11. services/platform/src/stack/supervisor.ts — launchd/direct process generations for serving units
12. D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md — original flip contract

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED baseline: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-red.log` → Non-empty red log proving process-local-only flip on pre-fix HEAD
- Durable flip integration: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts` → Exit 0 including C-02 durable + cross-process cases
- Lint/type: `pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/soak-fence.ts services/platform/src/cli/holo.ts && pnpm tsgo --noEmit` → Exit 0
- path.json: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-c02-path.json` → path A + devops-engineer

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md#C-02, services/platform/src/cutover/soak-fence.ts:53-67,263-323, services/platform/src/queue/jobs-runner.ts:72-84, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:75-80, .spec/prds/mk6-migration/08-uc-sync.md:46-62, D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md
Interaction notes:
- Prefer HOLO_SECRETS_PATH disposable files in tests — never commit real secrets.yaml mutations
- If launchd unavailable, direct-mode supervisor restart of mastra/hono/scheduler is acceptable if process_generations evidence is still concrete
- H-05 also mentions arm timestamp / repoint — C-02 owns the NEW-STACK durable fence + rollback-repoint CLI; do not re-open Convex fence arm-order (that is H-05/C-03 scope)
- Coordinate with H-01: network verify assumes a running server that already observed the durable fence
pattern: Authoritative control-plane write of the single pinned HOLO_MIGRATION_READ_ONLY key (secrets.yaml and/or launchd EnvironmentVariables via stack supervisor), then restart/reload serving process generations so isMigrationReadOnly() observes '1' without client env inject. Reciprocal cutover:rollback-repoint writes data_plane=convex config for UC-SYNC-04. Keep isMigrationReadOnly / Hono / MCP / queue rejection shapes unchanged.
pattern_source: D06-01/D06-05 pinned fence contract + services/platform/src/config/secrets.ts overlay + stack/supervisor launchd generations + 08-uc-sync.md UC-SYNC-04
anti_pattern: process.env-only flip (soak-fence.ts:58-67,263-269); .tmp soak-state with zero consumers (302-321); proving fence by injecting env into gate client (gate-plan.json:75-80); inventing a second Postgres fence table; deleting convex/ as 'rollback'

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is cutover control-plane durability for HOLO_MIGRATION_READ_ONLY: secrets/control-plane write, launchd/stack process generations for Hono/MCP/workers, and reciprocal data-plane repoint to frozen Convex (UC-SYNC-04). This is operator-facing infra on the CAP-CUT-01 flip path already owned by devops-engineer in D06-05 — not Mastra agent/tool framework code. Implementer stays devops-engineer; planner is mastra-planner (platform cutover contract ownership); reviewer = mastra-reviewer + standing test-quality lens on process-generation oracles.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-01, D06-04, D06-05
Blocks: unqualified-sprint-29-close, REDHAT-FIX-S29-H01

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md C-02; reviewed SHA 2b966c7b60559ec9986cf737ed5322a6146c7960', 'D06-05 AC-1 FAIL is the contract parent; this task remediates the production durability gap without inventing a second fence mechanism', 'H-05 may share rollback evidence themes — C-02 owns new-stack durable flip + repoint action surface; H-05 owns Convex arm-timestamp ordering', 'Fakeability: AC-2 must not greenwash via createHonoApp in-process']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-C02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "etl_reconciled_green": {
      "description": "D06-04 cutover:run-etl completed with unexplainedVariance==0 and a real runId in watermark-report.json.",
      "seed_method": "cli",
      "records": [
        "watermark-report.json exists with ok:true, unexplainedVariance:0, non-empty runId",
        "loadedByTable has documents and conversations keys"
      ]
    },
    "running_serving_process": {
      "description": "A real Hono/MCP serving process is up (stack supervisor / launchd / direct) with a known generation id BEFORE flip, accepting HTTP on PLATFORM_URL.",
      "seed_method": "cli",
      "records": [
        "GET $PLATFORM_URL/health returns 200",
        "process generation id recorded (pid or launchd instance)"
      ]
    },
    "soak_fence_durably_engaged": {
      "description": "cutover:flip has completed with durable control-plane HOLO_MIGRATION_READ_ONLY=1 and serving processes reloaded/restarted.",
      "seed_method": "cli",
      "records": [
        "flip-report.json ok:true with configured_target",
        "control-plane HOLO_MIGRATION_READ_ONLY=1"
      ]
    },
    "variance_gt_zero_etl_fixture": {
      "description": "Synthetic ETL/watermark report with unexplainedVariance>0 used only as negative control for flip refuse.",
      "seed_method": "fixture_file",
      "records": [
        "report file with unexplainedVariance:1 (or greater)",
        "ok:false or reconcile.ok false"
      ]
    },
    "pre_fix_head_process_local_fence": {
      "description": "Pre-fix HEAD behavior at reviewed SHA 2b966c7b: flip only setMigrationReadOnlyEnv + .tmp files; no consumer of soak-state.json.",
      "seed_method": "recorded_external",
      "records": [
        "soak-fence.ts:58-67 setMigrationReadOnlyEnv process-local",
        "soak-fence.ts:302-321 writes flip-report + soak-state under .tmp only",
        "gate-plan.json:75-80 injects HOLO_MIGRATION_READ_ONLY=1 into fresh process"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN etl_reconciled_green WHEN cutover:flip runs THEN durable control-plane stores HOLO_MIGRATION_READ_ONLY=1 and flip-report records configured_target + engaged_at + etl_run_id",
      "verify": "holo cutover:flip --json; inspect secrets/control-plane + flip-report",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "control-plane",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "only process.env mutated (soak-fence.ts:58-67,263-269)",
            "only .tmp soak-state written with no consumer (302-321)"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "etl_reconciled_green",
            "action": {
              "actor": "operator",
              "steps": [
                "run cutover:flip --json",
                "read control-plane HOLO_MIGRATION_READ_ONLY",
                "read flip-report configured_target"
              ]
            },
            "end_state": {
              "must_observe": [
                "control-plane HOLO_MIGRATION_READ_ONLY equals literal '1'",
                "flip-report.ok equals true",
                "configured_target non-empty string length >= 8",
                "engaged_at matches /^\\d{4}-\\d{2}-\\d{2}T/",
                "etl_run_id non-empty"
              ],
              "must_not_observe": [
                "empty/start signature: process.env only with no control-plane write",
                "configured_target empty or none",
                "engaged_at empty or none"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN running_serving_process WHEN flip completes THEN process_generations proven and clean-env cross-process POST /api/documents returns 423 dual-key migration_read_only with unchanged row count",
      "verify": "flip-report process_generations; env -u HOLO_MIGRATION_READ_ONLY curl POST /api/documents",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "hono",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "client injects HOLO_MIGRATION_READ_ONLY=1 (gate-plan.json:75-80)",
            "proof only via in-process createHonoApp"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "running_serving_process",
            "action": {
              "actor": "operator",
              "steps": [
                "flip",
                "record generations",
                "clean-env POST write"
              ]
            },
            "end_state": {
              "must_observe": [
                "process_generations.before non-empty",
                "process_generations.after non-empty",
                "HTTP status equals 423",
                "body.error equals 'migration_read_only'",
                "body.code equals 'migration_read_only'",
                "documents count before equals after"
              ],
              "must_not_observe": [
                "empty/start signature: HTTP 201 after flip",
                "row count increases",
                "client env carries HOLO_MIGRATION_READ_ONLY=1 as sole proof"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "UC-SYNC-04",
      "description": "GIVEN soak_fence_durably_engaged WHEN cutover:rollback-repoint runs THEN rollback_report records Convex data-plane repoint without deleting convex/",
      "verify": "holo cutover:rollback-repoint --json; jq .target",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "control-plane",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "docs-only rollback",
            "convex/ deleted"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak_fence_durably_engaged",
            "action": {
              "actor": "operator",
              "steps": [
                "run rollback-repoint --json",
                "inspect report + control-plane"
              ]
            },
            "end_state": {
              "must_observe": [
                "rollback_report.ok equals true",
                "target non-empty Convex identifier",
                "engaged_at ISO timestamp",
                "data_plane equals 'convex' OR target_kind equals 'convex'",
                "convex/ still exists"
              ],
              "must_not_observe": [
                "empty/start signature: no rollback CLI",
                "target empty or none",
                "convex/ deleted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN variance_gt_zero_etl_fixture WHEN flip runs THEN non-zero exit and no durable 1 write; process-local-only is not accepted as green",
      "verify": "flip variance>0 expect nonzero; C-02 suite requires durable assertions",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "flip exit 0 on variance>0",
            "suite greens on setMigrationReadOnlyEnv alone"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "variance_gt_zero_etl_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "run flip",
                "assert refuse",
                "run C-02 suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "flip exit code != 0",
                "error.code non-empty",
                "C-02 suite requires durable write evidence to pass"
              ],
              "must_not_observe": [
                "empty/start signature: flip exit 0 with variance>0",
                "suite pass on process-local-only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_head_process_local_fence WHEN implementer completes THEN red log + green evidence + path.json A devops-engineer exist",
      "verify": "test -s redhat-fix-s29-c02-red.log && jq path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "no red log",
            "green without red"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_head_process_local_fence",
            "action": {
              "actor": "cli_user",
              "steps": [
                "capture red",
                "implement",
                "capture green",
                "write path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "red log size > 0",
                "path equals A",
                "agent equals devops-engineer"
              ],
              "must_not_observe": [
                "empty/start signature: green only",
                "missing path.json"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "durable control-plane write of HOLO_MIGRATION_READ_ONLY=1",
      "maps_to_ac": "AC-1",
      "verify": "rg HOLO_MIGRATION_READ_ONLY $HOLO_SECRETS_PATH"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "process_generations before/after present",
      "maps_to_ac": "AC-2",
      "verify": "jq .process_generations .tmp/D06-05/flip-report.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "clean-env POST returns 423 dual-key",
      "maps_to_ac": "AC-2",
      "verify": "curl -i POST /api/documents without HOLO_MIGRATION_READ_ONLY"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "documents count unchanged",
      "maps_to_ac": "AC-2",
      "verify": "SELECT count(*) before/after"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "rollback-repoint report Convex target",
      "maps_to_ac": "AC-3",
      "verify": "jq .target .tmp/D06-05/rollback-report.json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "flip refuse variance>0",
      "maps_to_ac": "AC-4",
      "verify": "echo $?"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "red log non-empty",
      "maps_to_ac": "AC-5",
      "verify": "test -s redhat-fix-s29-c02-red.log"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "MCP mutation + job still fenced after durable engage",
      "maps_to_ac": "AC-2",
      "verify": "tools/call mutation + runJob assert prefixes"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "durable-distributed-migration-read-only-fence",
    "process-generation-flip-evidence",
    "uc-sync-04-rollback-repoint-action"
  ],
  "consumes": [
    "d06-04-etl-reconcile-green",
    "d06-01-pinned-holo-migration-read-only-contract",
    "d06-05-flip-and-verify-cli-surface",
    "platform-secrets-and-stack-supervisor"
  ],
  "boundary_contracts": [
    "HOLO_MIGRATION_READ_ONLY single-key contract preserved",
    "Cross-process proof without client env inject required",
    "UC-SYNC-04 rollback-repoint is executable config, not docs-only"
  ],
  "proposed_by": "mastra-planner"
}
-->

</details>
