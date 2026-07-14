# compat-2 — Pin the compatibility lockfile + machine-readable compatibility record

## What this does
Freezes the exact, compatible `Bun / @mastra/core / @mastra/pg / @mastra/mcp / ai + @ai-sdk/openai-compatible / Zod` set that compat-1's spike proved green into a committed Bun lockfile and a machine-readable, dated **compatibility record**, exposed via `holo compat:record`.

## Why
The runtime contract requires the committed lockfile to be the authority for an exact compatible set, and the record to name every exact version, its release date, the verified Postgres/Bun combo, and the upgrade procedure — version ranges are not an acceptance contract.

## How to verify
`bun services/platform/src/cli/holo.ts compat:record --verify` → exit 0; `holo compat:record` prints every version with an ISO release date; a record with a dropped date fails `--verify`.

## Scope
Modifies `services/platform/package.json` (exact pins) and adds `services/platform/bun.lock`, `services/platform/compat/compatibility-record.json`, `src/compat/record.ts`. Does NOT touch the spike harness (compat-1) or the fleet manifest (compat-3).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: compat-2 — Pin the compatibility lockfile + machine-readable compatibility record
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (INFRA — verified via checklist/CLI; seeded-evidence still required)
SPRINT:     [Sprint 1](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
services/platform pins exact versions (0 range specifiers on the six families), a committed `bun.lock`, and a dated `compatibility-record.json`; `holo compat:record --verify` exits 0 and `holo compat:record` prints each version + release date + verified Postgres18/Bun combo + upgrade procedure.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST pin EXACT versions (no `^`/`~`/`x`) for Bun, @mastra/core, @mastra/pg, @mastra/mcp, ai + @ai-sdk/openai-compatible, Zod; commit `services/platform/bun.lock`.
- MUST author `compatibility-record.json` naming each exact version, its release date, the verified Postgres 18 + Bun combo, and the upgrade procedure; the versions MUST equal the set compat-1 proved green (including the @mastra/pg version the spike selected).
- NEVER record a range or "Mastra 1.x" as the contract; NEVER hand-invent release dates (must match the published npm/GitHub release); NEVER pin a version the spike never ran.
- NEVER modify the spike harness (compat-1) or fleet manifest (compat-3).
- STRICTLY: record is machine-readable JSON with a stable schema; the upgrade procedure states any bump re-runs the full five-cell spike and updates the record.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): record names exact version + date + verified combo + upgrade procedure for all 6 families
- [ ] AC-2: `holo compat:record` prints the dated version table
- [ ] AC-3: exact pins only (zero ranges) with a committed bun.lock
- [ ] AC-4: record verifier has teeth — a dropped date / lockfile drift fails closed
- [ ] `pnpm biome check .` clean; only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Compatibility record names every exact version + date + verified combo + upgrade procedure
  GIVEN compat-1 produced a green pinned set (proven_set)
  WHEN  compatibility-record.json is authored and validated
  THEN  `compat:record --verify` exits 0 listing 6 families each with exact version + ISO release date + verifiedPostgres='18' + verifiedBun + upgradeProcedure
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  SCENARIO — start_ref: proven_set · evidence: stdout
    NEGATIVE_CONTROL: would fail if any family is missing a version/date or the verified combo/upgrade procedure is absent
    MUST_OBSERVE: `compat:record --verify` exit 0; 6 families each with exact version + ISO date + verifiedPostgres='18'
    MUST_NOT_OBSERVE: exit ≠ 0, a family missing version/date, a range string like '^1'/'~1'

AC-2 `holo compat:record` prints the dated version table
  GIVEN the record is authored (AC-1)
  WHEN  the operator runs `holo compat:record`
  THEN  stdout shows each pinned version with its release date + the verified combo, exit 0
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: stdout contains "@mastra/core <exact> <ISO-date>" + a line each for @mastra/pg, @mastra/mcp, ai/@ai-sdk/openai-compatible, zod, bun · MUST_NOT_OBSERVE: any version line without an ISO date

AC-3 Exact pins only — zero ranges — with a committed Bun lockfile
  GIVEN services/platform/package.json + bun.lock committed
  WHEN  the pinned dependency block is scanned and the lockfile checked
  THEN  no ^/~/x/* range on the six families and services/platform/bun.lock exists
  TEST_TIER: unit · UNIT_TEST_JUSTIFIED: static repo-config invariant with zero I/O — grep/file check is the correct oracle; live compatibility is proven by compat-1, not here.

AC-4 Record verifier has teeth — drift/omission fails closed
  GIVEN a temp copy of the record with a dropped version date
  WHEN  `holo compat:record --verify` runs against it
  THEN  exit non-zero naming the missing field
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra
  MUST_OBSERVE: dropped-date verifier exit ≠ 0 + prints the missing field · MUST_NOT_OBSERVE: exit 0 on an incomplete record

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/package.json (MODIFY: exact pins), services/platform/bun.lock (NEW: committed)
- services/platform/compat/compatibility-record.json (NEW), services/platform/src/compat/record.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY: add compat:record subcommand)
writeProhibited: services/platform/src/compat/spike.ts (compat-1), services/platform/fleet/** (compat-3), convex/**, app/**, any *.test.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md:11-16 [PRIMARY PATTERN] — record MUST name exact version+date+verified combo+upgrade procedure
2. .spec/prds/mk6-migration/10-technical-requirements/06-external-dependencies.md:9-25 — exact dep families; @mastra/pg version selected only after the real-Bun spike
3. holocron-mcp/package.json:34-52 — current @mastra pins/engines baseline to reconcile
4. package.json:36-153 — root ai/@ai-sdk versions + packageManager cross-reference

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- record completeness verifier: `bun services/platform/src/cli/holo.ts compat:record --verify` → Exit 0
- prints dated versions: `bun services/platform/src/cli/holo.ts compat:record` → each version with an ISO date
- no ranges + lockfile committed: `test -f services/platform/bun.lock && ! grep -REn '"(@mastra/(core|pg|mcp)|ai|@ai-sdk/openai-compatible|zod)":[[:space:]]*"[\^~]' services/platform/package.json` → Exit 0
- lint `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: exact pins (no range), committed lockfile, dated record matching the proven set, verifier has teeth. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: compat-1 (provides the proven pinned set) · Blocks: compat-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "compat-2",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "proven_set": { "description": "The exact version set compat-1's spike proved green", "seed_method": "cli", "records": ["bun --cwd services/platform pm ls after a green holo compat:spike"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN a green pinned set WHEN compatibility-record.json is authored THEN `compat:record --verify` exit 0 with 6 families each exact version + ISO date + verifiedPostgres='18' + upgradeProcedure",
      "verify": "bun services/platform/src/cli/holo.ts compat:record --verify",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["any of the 6 families missing a version or date", "verified combo / upgrade procedure absent"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "proven_set", "action": { "actor": "cli_user", "steps": ["holo compat:record --verify"] },
          "end_state": { "must_observe": ["exit 0", "6 families each with exact version + ISO release date", "verifiedPostgres='18'"], "must_not_observe": ["exit != 0", "a family missing version/date", "a range string like '^1'/'~1'"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the record is authored WHEN `holo compat:record` runs THEN stdout shows each version with its ISO release date + verified combo, exit 0",
      "verify": "bun services/platform/src/cli/holo.ts compat:record | grep -Eiq '@mastra/core.+[0-9]{4}-[0-9]{2}-[0-9]{2}'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["printer emits versions without dates", "reads source ranges instead of the committed record"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "proven_set", "action": { "actor": "cli_user", "steps": ["holo compat:record"] },
          "end_state": { "must_observe": ["'@mastra/core <exact> <ISO-date>' plus a line each for @mastra/pg,@mastra/mcp,ai/@ai-sdk/openai-compatible,zod,bun"], "must_not_observe": ["any version line without an ISO date", "exit != 0"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN package.json + bun.lock committed WHEN scanned THEN no ^/~/x/* range on the six families and services/platform/bun.lock exists",
      "verify": "test -f services/platform/bun.lock && ! grep -REn '\"(@mastra/(core|pg|mcp)|ai|@ai-sdk/openai-compatible|zod)\":[[:space:]]*\"[\\^~]' services/platform/package.json" },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN a record copy with a dropped date WHEN `compat:record --verify` runs THEN exit non-zero naming the missing field",
      "verify": "cp services/platform/compat/compatibility-record.json /tmp/rec.json && node -e \"const r=require('/tmp/rec.json');delete r.dependencies[0].releaseDate;require('fs').writeFileSync('/tmp/rec.json',JSON.stringify(r))\" && bun services/platform/src/cli/holo.ts compat:record --verify --record /tmp/rec.json; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "mastra",
        "negative_control": { "would_fail_if": ["the verifier passes a record missing a date / disagreeing with the lockfile"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "proven_set", "action": { "actor": "cli_user", "steps": ["drop a releaseDate, run compat:record --verify --record"] },
          "end_state": { "must_observe": ["exit != 0", "prints the missing field"], "must_not_observe": ["exit 0 on an incomplete record"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "`compat:record --verify` exits 0 asserting all 6 families carry exact version+date+combo+upgrade procedure", "verify": "bun services/platform/src/cli/holo.ts compat:record --verify" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "`compat:record` stdout shows each version with an ISO release date", "verify": "bun services/platform/src/cli/holo.ts compat:record | grep -Eiq '@mastra/core.+[0-9]{4}-[0-9]{2}-[0-9]{2}'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "no range specifier on the six families and bun.lock committed", "verify": "test -f services/platform/bun.lock && ! grep -REn '\"(@mastra/(core|pg|mcp)|ai|@ai-sdk/openai-compatible|zod)\":[[:space:]]*\"[\\^~]' services/platform/package.json" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "verifier rejects a record with a dropped date (teeth)", "verify": "cp services/platform/compat/compatibility-record.json /tmp/rec.json && node -e \"const r=require('/tmp/rec.json');delete r.dependencies[0].releaseDate;require('fs').writeFileSync('/tmp/rec.json',JSON.stringify(r))\" && bun services/platform/src/cli/holo.ts compat:record --verify --record /tmp/rec.json; test $? -ne 0" }
  ]
}
-->
</details>
