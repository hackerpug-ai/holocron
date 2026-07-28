# REDHAT-FIX-S27-18 — [R-3] Make kill induction honest or kill a real mid-archive backup process

## What this does

Close residual red-hat R-3 by making CAP-BAK-01 kill induction claim-strength honest: stop stamping production_catch on induce early-return and stop labeling staged pgbackrest info/help+sleep SIGKILL as mid-archive — OR implement a true mid-flight archive-push/backup kill under WAL write load whose natural catch writes failed.

## Why

- Source finding: .spec/reviews/red-hat-sprint27-20260728T082702Z.md R-3 HIGH (residual after F-1 dual-path close).
- Severity HIGH; not full F-1 reopen — real OS kill exists; mid-archive + production_catch claim strength is dishonest.
- Negative controls MUST fail if production_catch stamped without natural catch; if gate still claims mid-archive while only killing sleep/info shell.
- Runtime: test PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; typecheck pnpm tsgo --noEmit; lint pnpm biome check .

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/wal-archive.ts, services/platform/src/backup/base-backup.ts, services/platform/src/backup/alerting.ts, services/platform/src/cli/holo.ts, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, services/platform/tests/integration/**, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, .tmp/REDHAT-FIX-

Prohibited: app/**, services/platform/src/db/migrations/**, services/platform/deploy/launchd/**, secrets.yaml, node_modules/**, .spec/reviews/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-18 — [R-3] Make kill induction honest or kill a real mid-archive backup process
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
After GREEN: (1) production_catch is true only when wal-archive/base-backup natural try/catch writes status=failed; (2) gate step 4 text + oracle and SPRINT.md step 4 either drop 'mid-archive' for staged kills or require archive-push/backup PID kill evidence + natural catch; (3) RED suite fails if production_catch is stamped without natural catch or if mid-archive is claimed while only killing sleep/info shell; (4) real_process_killed may remain true for staged shell kills if honestly flagged (e.g. staged_shell_kill / kill_kind); (5) typecheck+lint clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST choose Path Honest (reword gate/SPRINT/AC + induction flags; production_catch only from natural catch) OR Path True Mid-Archive (spawn real archive-push/backup under WAL write load, kill that PID mid-flight, require natural job failure path) — document which path was taken in evidence
- MUST set production_catch true only when the job try/catch writes status=failed after a real job body attempt — NEVER on induce early-return that upserts failed after staged shell SIGKILL
- MUST update gate-plan.json step 4 text + literal_cmd oracle so it cannot certify mid-archive solely via (real_process_killed OR production_catch) while killing info/help+sleep shells
- MUST update SPRINT.md human-testing step 4 wording to match honest claim strength (drop or qualify mid-archive if Path Honest)
- MUST extend services/platform/tests/integration/sprint27-backup-alerting-red.test.ts with red_first negative controls that FAIL if production_catch is stamped without natural catch OR if mid-archive is claimed while only killing sleep/info shell
- MUST keep PLATFORM_IT=1 integration as PRIMARY proof; pnpm tsgo --noEmit and pnpm biome check . clean on write_allowed files
- NEVER stamp production_catch:true on the induceFault='kill' early-return after staged shell kill while bypassing the natural archive-push/backup try/catch
- NEVER leave gate step 4 / SPRINT.md claiming 'Kill the backup job mid-archive' when evidence is only /bin/sh -c 'pgbackrest … info; sleep 30' SIGKILL (~1s theatre)
- NEVER treat lastWalSegment='killed-mid-flight' upsert alone as proof of mid-archive archive-push death
- NEVER weaken RED suite to accept production_catch OR real_process_killed as sufficient mid-archive proof without kill_kind / command-line evidence
- NEVER reopen F-1 poison-only path as the sole kill proof (DEAD sentinel / synthetic_poison-only)
- STRICTLY PRIMARY ACs are test_tier integration with PLATFORM_IT=1 on real mini tooling (pgbackrest binary present)
- STRICTLY flow_ref T-PLAT-024 (alert after induced kill) and T-PLAT-021 (WAL archive continuity/job) as appropriate
- STRICTLY tdd_mode red_first: write/extend failing RED assertions for dishonest production_catch + mid-archive overclaim BEFORE implementation GREEN
- STRICTLY negative_control must fail if production_catch stamped without natural catch; if gate still claims mid-archive while only killing sleep/info shell

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — kill induction claim strength (honest label OR true mid-archive)
- [ ] AC-2: production_catch only from natural job try/catch
- [ ] AC-3: Gate step 4 + SPRINT.md mid-archive wording honesty
- [ ] AC-4: RED suite negative controls for dishonest production_catch and mid-archive overclaim
- [ ] AC-5: Typecheck and lint clean
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — kill induction claim strength (honest label OR true mid-archive) (flow_ref T-PLAT-024)
  GIVEN healthy_wal_archive_ready + real pgbackrest on mini; R-3 staged_shell_kill_baseline is the pre-fix RED state
  WHEN  operator runs `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json` (and optional concurrent WAL write burst if Path True Mid-Archive)
  THEN  claim strength is honest: no mid-archive/production_catch theatre; status=failed still reachable for alert proof via real OS kill and/or natural catch
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-failure-induction
  VERIFY: `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json | tee .tmp/REDHAT-FIX-S27-18/induce-kill.json; jq -e '.ok==true and .induction.path=="production_truth" and .heartbeat.status=="failed" and .induction.real_process_killed==true' .tmp/REDHAT-FIX-S27-18/induce-kill.json; # Path Honest: jq -e '.induction.production_catch!=true and ((.induction.kill_kind//"")|test("staged|process_kill|shell") or (.induction.mid_archive!=true))' .tmp/REDHAT-FIX-S27-18/induce-kill.json; # Path True Mid-Archive: jq -e '.induction.production_catch==true and ((.induction.kill_kind//"")|test("archive-push|backup|mid_archive") or (.induction.mid_archive==true))' .tmp/REDHAT-FIX-S27-18/induce-kill.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if production_catch stamped true on induce early-return after only info|help+sleep shell SIGKILL; gate/CLI still labels kill as mid-archive while kill target cmdline is only info/help/sleep; lastWalSegment killed-mid-flight is sole mid-archive proof with no archive-push/backup PID evidence; stub/static induction hardcodes production_catch:true without natural catch; synthetic_poison-only kill path is the sole certification proof
  START_REF: healthy_wal_archive_ready
  MUST_OBSERVE: induction.path=production_truth; heartbeat.status=failed for wal_archive; real_process_killed=true with pid_killed integer or documented process evidence; either production_catch=false + honest non-mid-archive label (Path Honest) OR production_catch=true + archive-push/backup mid-flight evidence (Path True Mid-Archive)
  MUST_NOT_OBSERVE: production_catch:true with only staged info/help+sleep shell kill and early-return upsert; mid-archive claim without archive-push|backup kill target; status=success after kill induction; synthetic_poison as sole kill path
  EVIDENCE: induction_and_heartbeat_artifact

### AC-2 [PRIMARY] — production_catch only from natural job try/catch (flow_ref T-PLAT-021)
  GIVEN staged_shell_kill_baseline source at wal-archive.ts induceFault kill early-return vs natural failure catch
  WHEN  implementer changes flag semantics and RED asserts production_catch rules
  THEN  early-return after staged shell kill does not set production_catch true; natural catch after real job body failure may set production_catch true
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-failure-induction
  VERIFY: `rg -n "production_catch" services/platform/src/backup/wal-archive.ts services/platform/src/backup/alerting.ts services/platform/src/backup/base-backup.ts; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts -t 'production_catch|kill induction|mid-archive|R-3|honest kill'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if induce early-return still hardcodes production_catch: true after killRealPgbackrestProcess; tests still treat production_catch OR real_process_killed as interchangeable natural-catch proof; alerting.ts re-stamps production_catch:true after reading staged kill evidence alone
  START_REF: staged_shell_kill_baseline
  MUST_OBSERVE: production_catch false or absent on staged shell kill early-return path; if Path True Mid-Archive implemented: production_catch true only after natural catch writer; status=failed still written for alertability
  MUST_NOT_OBSERVE: production_catch:true solely from induce early-return self-stamp; comment claiming 'same as natural catch' while bypassing job body
  EVIDENCE: source_and_test_transcript

### AC-3 — Gate step 4 + SPRINT.md mid-archive wording honesty (flow_ref T-PLAT-024)
  GIVEN gate-plan.json n=4 text 'Kill the backup job mid-archive' and literal_cmd accepting real_process_killed OR production_catch; SPRINT.md step 4 same mid-archive phrasing
  WHEN  gate-plan + SPRINT.md are updated with the chosen path
  THEN  either wording drops/qualifies mid-archive and oracle requires honest flags, OR wording keeps mid-archive and oracle requires archive-push/backup kill + natural production_catch
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan
  VERIFY: `jq -r '.steps[] | select(.n==4) | .text,.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | tee .tmp/REDHAT-FIX-S27-18/step4-claim.txt; rg -n "mid-archive|Kill the backup" .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json; # Path Honest: step text MUST NOT claim unqualified mid-archive for staged kill; # Path True Mid-Archive: literal_cmd MUST require production_catch==true AND archive-push/backup evidence (not soft OR alone)`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate still claims mid-archive while only killing sleep/info shell; jq oracle still passes on production_catch self-stamp alone without natural catch; SPRINT.md step 4 left as unqualified mid-archive after Path Honest chosen; soft OR real_process_killed OR production_catch remains sole mid-archive certification
  START_REF: staged_shell_kill_baseline
  MUST_OBSERVE: step 4 human text matches actual kill strength; literal_cmd fails closed on dishonest production_catch / mid-archive overclaim; alert still fires for wal_archive kill mode after reset→induce→sweep
  MUST_NOT_OBSERVE: unqualified mid-archive with staged shell-only kill; oracle that accepts production_catch:true from early-return theatre
  EVIDENCE: gate_plan_and_sprint_text

### AC-4 [PRIMARY] — RED suite negative controls for dishonest production_catch and mid-archive overclaim (flow_ref T-PLAT-024)
  GIVEN PLATFORM_IT=1 RED suite and kill induction module/CLI paths
  WHEN  tests assert kill_kind/honest flags and production_catch natural-only; optional static analysis of kill spawn cmdline
  THEN  negative controls fail if production_catch stamped without natural catch; fail if mid-archive claimed while only killing sleep/info shell; happy path still proves kill→alert
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting-red-suite
  VERIFY: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts 2>&1 | tee .tmp/REDHAT-FIX-S27-18/red-suite.log; test -f services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; rg -n "production_catch|mid-archive|kill_kind|staged_shell|R-3|honest kill" services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if production_catch stamped without natural catch; gate/tests still claim mid-archive while only killing sleep/info shell; tests only check real_process_killed==true and ignore claim strength; mocked induction returns production_catch:true with zero process interaction
  START_REF: healthy_wal_archive_ready
  MUST_OBSERVE: vitest exit 0 after GREEN; kill mode still posts alert with kill|killed|WAL keywords; explicit negative-control coverage for production_catch and mid-archive honesty
  MUST_NOT_OBSERVE: suite green solely because production_catch OR real_process_killed soft-pass; no new R-3 assertions in test file
  EVIDENCE: vitest_transcript

### AC-5 — Typecheck and lint clean (flow_ref T-PLAT-024)
  GIVEN write_allowed source/tests updated
  WHEN  pnpm tsgo --noEmit and pnpm biome check .
  THEN  both exit 0
  TEST_TIER: unit · TDD_STATE: red→green
  VERIFICATION_SERVICE: tooling
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if type errors introduced in wal-archive.ts / alerting.ts / tests; biome violations left unfixed in write_allowed paths
  START_REF: honest_flag_contract_ready
  MUST_OBSERVE: tsgo exit 0; biome check exit 0
  MUST_NOT_OBSERVE: error TS; biome Found errors
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Kill induction is either honest staged process-kill (no mid-archive / no false production_catch) or true mid-archive archive-push/backup kill with natural catch | AC-1 | `PLATFORM_IT=1 induce kill --json; assert honest flag contract + heartbeat failed` |
| TC-2 | production_catch only set by natural job try/catch — not induce early-return self-stamp | AC-2 | `rg + PLATFORM_IT=1 vitest kill honesty tests; source review of wal-archive induceFault block` |
| TC-3 | Gate step 4 and SPRINT.md claim strength match implementation path | AC-3 | `jq gate-plan step4; rg mid-archive SPRINT.md gate-plan.json; assert oracle fail-closed` |
| TC-4 | RED suite negative controls fail on dishonest production_catch and mid-archive-over-sleep-shell claims | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.te...` |
| TC-5 | Typecheck and lint clean | AC-5 | `pnpm tsgo --noEmit; pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/wal-archive.ts
- services/platform/src/backup/base-backup.ts
- services/platform/src/backup/alerting.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- services/platform/tests/integration/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- .tmp/REDHAT-FIX-S27-18/**
- .tmp/D04-01/**

writeProhibited:
- app/**
- services/platform/src/db/migrations/**
- services/platform/deploy/launchd/**
- secrets.yaml
- node_modules/**
- .spec/reviews/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:62-67 — R-3 HIGH kill induction overclaims mid-archive / production_catch — full finding + expected fix
2. services/platform/src/backup/wal-archive.ts:105-240 — killRealPgbackrestProcess staged info/help+sleep shell + SIGKILL evidence
3. services/platform/src/backup/wal-archive.ts:528-615 — induceFault='kill' early-return upserts failed + stamps production_catch:true
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:51-61 — step 4 mid-archive text + real_process_killed OR production_catch oracle
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md:44-44 — Human testing step 4 mid-archive claim
6. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:337-430 — failure (a) kill induction accepts real_process_killed OR production_catch
7. services/platform/src/backup/alerting.ts:1-50 — induceBackupFailure production_truth dispatch into wal-archive kill path (locate induceBackupFailure kill_wal_behind)
8. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-01-f-1-replace-synthetic-heartbeat-poisoning-with-real-backup-failure-induction-or-.md:1-100 — F-1 dual-path contract this residual tightens (real OS kill closed; claim strength residual)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0
- red-integration: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → exit 0 after GREEN; honesty negative controls present; kill mode still alerts
- kill-induction-honesty-cli: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json` → real_process_killed true; heartbeat failed; production_catch only if natural catch; no unqualified mid-archive theatre

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, red-hat-sprint27-20260728T082702Z.md R-3, REDHAT-FIX-S27-01 F-1 dual-path
Pattern: Honest induction flags + claim strength match actual kill target → alert sweep still fires on status=failed
Anti-pattern: Staged /bin/sh -c 'pgbackrest info; sleep 30' SIGKILL + immediate upsert lastWalSegment=killed-mid-flight + production_catch:true labeled mid-archive (~1.1s theatre certification)
- Preferred Path Honest is usually lower risk: reword mid-archive claims, add kill_kind=staged_shell_kill, set production_catch=false on early-return, keep real_process_killed=true for OS kill proof, preserve alert fire.
- Path True Mid-Archive is higher fidelity but flaky/longer: require concurrent WAL write load, identify archive-push/backup PID, SIGKILL mid-flight, let natural catch write failed, only then production_catch=true.
- Coordinate with REDHAT-FIX-S27-04 mode isolation (reset→induce→sweep) — do not break step 4 isolation oracle for post[wal_archive].
- Do not reopen F-1 poison-only DEAD sentinel as kill proof.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0
- red-integration: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → exit 0 after GREEN; honesty negative controls present; kill mode still alerts
- kill-induction-honesty-cli: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json` → real_process_killed true; heartbeat failed; production_catch only if natural catch; no unqualified mid-archive theatre

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: devops-engineer
- Reviewer: code-reviewer
- Rationale: Owns CAP-BAK-01 kill induction under services/platform/src/backup/wal-archive.ts (killRealPgbackrestProcess + runWalArchiveJob induceFault='kill' early-return), alerting induce path, gate-plan step 4, and SPRINT.md mid-archive claim text. Residual R-3 is honesty of production_catch / mid-archive labeling after F-1 dual-path closed — not a full reopen of poison-only. Reviewer: code-reviewer verifies flags and gate/SPRINT wording cannot claim mid-archive or production_catch without natural catch evidence.
- Proposed by: devops-engineer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- brain/docs/REACT-RULES.md is N/A — use services/platform conventions
- RULES.md
- services/platform/src/backup/* existing spawn/kill + heartbeat patterns; prefer minimal flag honesty over large refactors

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-01', 'REDHAT-FIX-S27-04', 'D04-05', 'D04-01', 'D04-03']
- blocks: ['sprint-27-red-hat-re-review', 'sprint-27-merge-gate']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-18)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-18",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "staged_shell_kill_baseline": {
      "description": "Current R-3 RED baseline: killRealPgbackrestProcess spawns /bin/sh -c 'pgbackrest \u2026 info; sleep 30' (or help+sleep), SIGKILLs shell; runWalArchiveJob(induceFault='kill') early-returns with production_catch:true and lastWalSegment killed-mid-flight without archive-push under write load. Step4 ~1.1s.",
      "seed_method": "recorded_external",
      "records": [
        "wal-archive.ts:121-125 inner command is info; sleep 30 or help+sleep",
        "wal-archive.ts:545-614 early-return stamps production_catch:true after immediate upsert",
        "gate-plan step 4 text contains 'mid-archive' and jq accepts real_process_killed OR production_catch",
        "red-hat-sprint27-20260728T082702Z.md R-3 evidence block"
      ]
    },
    "healthy_wal_archive_ready": {
      "description": "Postgres archive_mode=always, pgbackrest configured, wal_archive heartbeat fresh success so kill induction is distinguishable from prior failure.",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:healthy --all",
      "records": [
        "wal_archive heartbeat status=success before induction",
        "pgbackrest binary present (which pgbackrest or /opt/homebrew/bin/pgbackrest)"
      ]
    },
    "true_mid_archive_ready": {
      "description": "Optional Path True Mid-Archive fixture: WAL write load in flight so archive-push or backup has a live PID whose cmdline contains archive-push|backup (not only info/help/sleep).",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:wal --json (write burst) concurrent with kill of archive-push/backup PID",
      "records": [
        "live pgbackrest archive-push or backup PID before SIGKILL",
        "after kill, natural job catch writes status=failed; production_catch true only then"
      ]
    },
    "honest_flag_contract_ready": {
      "description": "Induce JSON schema after fix exposes kill_kind or equivalent (staged_shell_kill | mid_archive_archive_push | mid_archive_backup) plus real_process_killed and production_catch with honest semantics.",
      "seed_method": "cli",
      "records": [
        "backup:induce-failure --mode kill --job wal_archive --json",
        "induction.real_process_killed boolean",
        "induction.production_catch boolean only true on natural catch",
        "induction.kill_kind or documented honest label field"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN healthy wal_archive WHEN kill induction runs THEN claim strength is honest (Path Honest: real process kill without mid-archive/production_catch theatre; Path True Mid-Archive: archive-push/backup PID kill + natural catch) and heartbeat status=failed remains alertable",
      "verify": "bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json + honesty assertions on production_catch/kill_kind",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-failure-induction",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "production_catch stamped without natural catch",
            "mid-archive claimed while only killing sleep/info shell",
            "stub/static production_catch:true",
            "synthetic_poison-only kill proof"
          ]
        },
        "evidence": {
          "artifact_type": "induction_and_heartbeat_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_wal_archive_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "run kill induction",
                "inspect flags + heartbeat"
              ]
            },
            "end_state": {
              "must_observe": [
                "honest kill claim strength",
                "status=failed"
              ],
              "must_not_observe": [
                "mid-archive theatre",
                "false production_catch"
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
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN kill induction code paths WHEN failed heartbeat is written THEN production_catch is true only from natural job try/catch, never from induce early-return self-stamp after staged shell SIGKILL",
      "verify": "source review + PLATFORM_IT=1 vitest honesty tests for production_catch",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-failure-induction",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "early-return hardcodes production_catch:true",
            "alerting re-stamps production_catch after staged kill alone"
          ]
        },
        "evidence": {
          "artifact_type": "source_and_test_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "staged_shell_kill_baseline",
            "action": {
              "actor": "test",
              "steps": [
                "assert production_catch semantics"
              ]
            },
            "end_state": {
              "must_observe": [
                "production_catch natural-only"
              ],
              "must_not_observe": [
                "self-stamped production_catch on staged shell kill"
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
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN gate step 4 and SPRINT.md mid-archive wording WHEN fix lands THEN human claim + jq oracle match Path Honest or Path True Mid-Archive and fail closed on overclaim",
      "verify": "jq gate-plan step4; rg mid-archive SPRINT.md gate-plan.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "gate still claims mid-archive while only killing sleep/info shell",
            "soft OR oracle alone certifies mid-archive"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan_and_sprint_text",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "staged_shell_kill_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "update and assert step 4 claim honesty"
              ]
            },
            "end_state": {
              "must_observe": [
                "claim matches kill strength"
              ],
              "must_not_observe": [
                "unqualified mid-archive with staged shell-only kill"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN RED suite WHEN R-3 negative controls are added red_first THEN suite fails if production_catch stamped without natural catch or if mid-archive claimed while only killing sleep/info shell; green after honest fix with kill still alerting",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting-red-suite",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "production_catch stamped without natural catch",
            "mid-archive claimed while only killing sleep/info shell",
            "no R-3 honesty asserts added"
          ]
        },
        "evidence": {
          "artifact_type": "vitest_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_wal_archive_ready",
            "action": {
              "actor": "test",
              "steps": [
                "run RED suite with honesty asserts"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit 0 after GREEN",
                "negative controls present"
              ],
              "must_not_observe": [
                "soft-pass mid-archive theatre"
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
      "flow_ref": "T-PLAT-024",
      "description": "GIVEN implementation complete WHEN typecheck+lint run THEN exit 0",
      "verify": "pnpm tsgo --noEmit; pnpm biome check .",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "tooling",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "type errors in write_allowed",
            "biome errors in write_allowed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "honest_flag_contract_ready",
            "action": {
              "actor": "developer",
              "steps": [
                "typecheck",
                "lint"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit 0"
              ],
              "must_not_observe": [
                "error TS",
                "biome Found errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Honest kill induction claim strength",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 induce kill --json + honesty asserts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "production_catch natural-only",
      "maps_to_ac": "AC-2",
      "verify": "source + vitest production_catch honesty"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate/SPRINT mid-archive wording honesty",
      "maps_to_ac": "AC-3",
      "verify": "jq step4 + rg mid-archive"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED suite R-3 negative controls",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck and lint",
      "maps_to_ac": "AC-5",
      "verify": "pnpm tsgo --noEmit; pnpm biome check ."
    }
  ],
  "proposed_by": "devops-engineer",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

