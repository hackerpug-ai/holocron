# D01-04 — Consolidated secrets source + Convex-env-alias removal + `holo verify-no-convex-env`

## What this does

Create a consolidated secrets source that all config reads from, implement holo secrets doctor to verify resolution, remove all Convex env aliases from the repo, and implement holo verify-no-convex-env as a build gate - establishing config hygiene and dev/prod parity.

Provides: Consolidated secrets source (env vars + config file) for all platform config, holo secrets doctor command that verifies all required keys resolve, Convex env alias removal (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, deploy keys), holo verify-no-convex-env command that greps for remaining aliases.

## Why

- Consolidated secrets is config-hygiene + dev/prod parity, NOT multi-tenant isolation (AP-7 single-user tailnet)
- All config resolves from one source (no scattered env vars)
- Secrets are not persisted in repo (use .gitignore'd file or env, never commit secrets)
- MUST create consolidated secrets config at services/platform/config/secrets.yaml or equivalent (gitignored)
- MUST implement holo secrets doctor command that resolves all required config keys
- Grounded in: UC-PLAT-05, T-PLAT-017

## How to verify

- `test -f services/platform/config/secrets.yaml && test -f services/platform/config/.gitignore && grep -q 'secrets.yaml' services/platform/config/.gitignore` → Exit 0 (config file exists and is gitignored)
- `bun services/platform/src/cli/holo.ts secrets doctor` → Exit 0 (all required keys resolved)
- `grep -ri 'CONVEX_URL\|HOLOCRON_URL' app/ holocron-mcp/ services/platform/ | wc -l | grep -q '^0$'` → Exit 0 (zero matches)
- `bun services/platform/src/cli/holo.ts verify-no-convex-env` → Exit 0 (zero aliases found)
- `git log --all --full-history -- '*secrets.yaml' | wc -l | grep -q '^0$'` → Exit 0 (zero commits with secrets.yaml)

## Scope

Writes: services/platform/config/secrets.yaml (NEW - gitignored) · services/platform/config/secrets.example.yaml (NEW - committed schema) · services/platform/config/.gitignore (NEW - gitignore secrets.yaml) · services/platform/src/cli/holo.ts (MODIFY - add secrets:doctor, verify-no-convex-env commands) · services/platform/src/config/ (NEW - config loader module) · app/.env (MODIFY - remove EXPO_PUBLIC_CONVEX_URL) · holocron-mcp/** (MODIFY - remove HOLOCRON_URL references) · .github/workflows/** (MODIFY - remove CONVEX_DEPLOY_KEY references)

Prohibited: services/platform/src/db/** (MODIFY - Sprint 04 owns Postgres schema) · services/platform/src/mastra/** (MODIFY - Sprint 05 owns Mastra service) · services/platform/src/fleet/** (MODIFY - Sprint 01 owns Fleet Role Manifest) · Commit real secrets to repo (secrets.yaml MUST stay gitignored)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-04 — Consolidated secrets source + Convex-env-alias removal + `holo verify-no-convex-env`
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: N/A
SPRINT:     [Sprint 6 — Headless Deployment and Dev/Prod Parity](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Create a consolidated secrets source that all config reads from, implement holo secrets doctor to verify resolution, remove all Convex env aliases from the repo, and implement holo verify-no-convex-env as a build gate - establishing config hygiene and dev/prod parity.
Consolidated secrets config exists at services/platform/config/secrets.yaml (gitignored) with all required keys; holo secrets doctor resolves all keys and exits 0; all Convex env aliases (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, deploy keys) are removed from app/, holocron-mcp/, services/platform/; holo verify-no-convex-env greps and finds zero aliases; T-PLAT-017 is a CI build gate - all verified with real config resolution and real grep, not mocked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST create consolidated secrets config at services/platform/config/secrets.yaml or equivalent (gitignored)
- MUST implement holo secrets doctor command that resolves all required config keys
- MUST grep repo for Convex env aliases (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, CONVEX_DEPLOY_KEY, convex deploy keys)
- MUST remove all found Convex env aliases from app/, holocron-mcp/, services/platform/
- MUST implement holo verify-no-convex-env command that fails if aliases remain
- MUST include T-PLAT-017 build gate in CI (grep check)
- MUST support both mini and laptop config values (same structure, different values)
- NEVER commit secrets to repo - secrets config MUST be .gitignore'd
- NEVER leave Convex env aliases in code (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, deploy keys)
- NEVER mock secrets resolution - must read real env/files
- NEVER stub verify-no-convex-env - must grep real repo files
- NEVER use multi-tenant isolation (AP-7 single-user tailnet trust - this is config-hygiene, not tenant isolation)
- NEVER hardcode config values in code - must resolve from consolidated source
- STRICTLY all config resolves from consolidated secrets (env vars + config file) - no scattered sources
- STRICTLY secrets doctor fails if required keys missing (not mocked success)
- STRICTLY verify-no-convex-env greps real files (app/, holocron-mcp/, services/platform/) - not fake fixture
- STRICTLY T-PLAT-017 is a build gate (CI fails if aliases found)
- STRICTLY secrets config is .gitignore'd (never commit real secrets)
- STRICTLY config contract is portable (same structure on mini and laptop, values differ)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): Consolidated secrets source resolves all required config keys
- [x] AC-2 (PRIMARY): Convex env aliases removed from all repo surfaces
- [x] AC-3 (PRIMARY): holo verify-no-convex-env command greps and fails if aliases found
- [x] AC-4: Consolidated secrets config is gitignored and never committed
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Consolidated secrets source resolves all required config keys (flow_ref T-PLAT-017)
  GIVEN repo has no consolidated secrets source; config is scattered across env files and hard-coded values
  WHEN  operator creates consolidated secrets config and runs holo secrets doctor
  THEN  services/platform/config/secrets.yaml (or equivalent) exists with required keys (DATABASE_URL, fleet endpoints, etc.); holo secrets doctor reads config and verifies all keys resolve; exits 0; config is portable (same structure works on mini and laptop with different values)
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: secrets_config_present · evidence: stdout
    NEGATIVE_CONTROL: would fail if secrets doctor stubbed (always exits code 0); config file absent (deleted); required key removed (omitted); exit code 0 with missing keys (false pass)
    MUST_OBSERVE: `test -f services/platform/config/secrets.yaml` exits code 0; `bun services/platform/src/cli/holo.ts secrets doctor` exits code 0; output prints `DATABASE_URL: resolved`; output prints `MASTRA_API_KEY: resolved`; output prints `TAILSCALE_AUTH_KEY: resolved`; output prints (0) missing keys
    MUST_NOT_OBSERVE: exits code 1 (missing key); output prints (0) keys resolved (empty output); any key prints `MISSING` or (0) keys resolved

AC-2 [PRIMARY] Convex env aliases removed from all repo surfaces (flow_ref T-PLAT-017)
  GIVEN repo has Convex env aliases scattered (EXPO_PUBLIC_CONVEX_URL in app/, HOLOCRON_URL in holocron-mcp/, deploy keys in CI config)
  WHEN  operator greps and removes all Convex env aliases
  THEN  grep -ri 'CONVEX_URL\|HOLOCRON_URL\|convex deploy' across app/, holocron-mcp/, services/platform/ returns zero matches; EXPO_PUBLIC_CONVEX_URL removed from app/.env or app.config.js; HOLOCRON_URL removed from holocron-mcp/; CONVEX_DEPLOY_KEY removed from CI config; all code reads from consolidated secrets instead
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: repo_clean_of_convex_env · evidence: stdout
    NEGATIVE_CONTROL: would fail if alias omitted from removal (still present); grep stubbed (scans fake fixture not real files); exit code 0 with aliases remaining (false pass)
    MUST_OBSERVE: `grep -ri 'CONVEX_URL|HOLOCRON_URL' app/ holocron-mcp/ services/platform/` returns (0) matches; `grep -c EXPO_PUBLIC_CONVEX_URL app/.env` returns 0; `grep -c HOLOCRON_URL holocron-mcp/.env` returns 0; `grep -c CONVEX_URL services/platform/.env` returns 0
    MUST_NOT_OBSERVE: grep returns ≥1 match (alias remains); grep prints EXPO_PUBLIC_CONVEX_URL in app/.env (not removed); grep prints HOLOCRON_URL in holocron-mcp/.env (not removed); grep returns (0) matches (all aliases removed)

AC-3 [PRIMARY] holo verify-no-convex-env command greps and fails if aliases found (flow_ref T-PLAT-017)
  GIVEN operator has removed Convex env aliases
  WHEN  operator runs holo verify-no-convex-env
  THEN  Command greps app/, holocron-mcp/, services/platform/ for CONVEX_URL, HOLOCRON_URL, deploy keys; if zero matches found, exits 0 and prints 'zero Convex env aliases found'; if matches found, exits 1 and prints each alias location; this is a build gate (T-PLAT-017)
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: repo_clean_of_convex_env · evidence: stdout
    NEGATIVE_CONTROL: would fail if command absent (not implemented); grep mocked (always exits code 0); exit code 0 with aliases present (false pass)
    MUST_OBSERVE: clean repo: `holo verify-no-convex-env` exits code 0; reintroduce EXPO_PUBLIC_CONVEX_URL=`https://holocron.convex.cloud` to app/.env; dirty repo: `holo verify-no-convex-env` exits code 1; dirty repo: command prints `Found 1 Convex env alias`; dirty repo: command prints `app/.env: EXPO_PUBLIC_CONVEX_URL`
    MUST_NOT_OBSERVE: clean repo: exits code 1 (false negative); dirty repo: exits code 0 (alias not detected); command prints (0) aliases found (stubbed)

AC-4 Consolidated secrets config is gitignored and never committed (flow_ref T-PLAT-017)
  GIVEN consolidated secrets config contains real secrets (DATABASE_URL, fleet endpoints)
  WHEN  operator commits to repo
  THEN  services/platform/config/secrets.yaml is .gitignore'd; git diff shows no secrets committed; repo contains only config schema/example, not real values
  TEST_TIER: integration · VERIFICATION_SERVICE: git · TDD_STATE: red
  SCENARIO — start_ref: secrets_config_present · evidence: stdout
    NEGATIVE_CONTROL: would fail if secrets.yaml committed (not gitignored); gitignore entry omitted (absent); exit code 0 with committed file (false pass)
    MUST_OBSERVE: `git check-ignore services/platform/config/secrets.yaml` exits code 0; `git check-ignore services/platform/config/secrets.yaml` prints `services/platform/config/secrets.yaml`; `grep secrets.yaml .gitignore` returns 1 match; `git log --all --oneline -- '**/secrets.yaml'` returns (0) commits; test -f .git/info/exclude exits code 0 (exclude exists); grep secrets.yaml .git/info/exclude returns (0) matches (not in exclude)
    MUST_NOT_OBSERVE: git check-ignore exits code 1 (not ignored); git log prints ≥1 secrets.yaml commit (accidentally committed); git check-ignore prints (0) output (file not in gitignore)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/config/secrets.yaml (NEW - gitignored)
- services/platform/config/secrets.example.yaml (NEW - committed schema)
- services/platform/config/.gitignore (NEW - gitignore secrets.yaml)
- services/platform/src/cli/holo.ts (MODIFY - add secrets:doctor, verify-no-convex-env commands)
- services/platform/src/config/ (NEW - config loader module)
- app/.env (MODIFY - remove EXPO_PUBLIC_CONVEX_URL)
- holocron-mcp/** (MODIFY - remove HOLOCRON_URL references)
- .github/workflows/** (MODIFY - remove CONVEX_DEPLOY_KEY references)
writeProhibited: services/platform/src/db/** (MODIFY - Sprint 04 owns Postgres schema), services/platform/src/mastra/** (MODIFY - Sprint 05 owns Mastra service), services/platform/src/fleet/** (MODIFY - Sprint 01 owns Fleet Role Manifest), Commit real secrets to repo (secrets.yaml MUST stay gitignored)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:68-76 [UC-PLAT-05 AC-3 (consolidated secrets, zero Convex env)]
2. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-38 [AP-7 tailnet trust boundary (NO RLS, NO multi-tenant - this is config-hygiene, not tenant isolation)]
3. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/06-external-dependencies.md:38-39 [Removed Convex dependencies and env vars]
4. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:47-49 [T-PLAT-017 build gate (config from one source, zero Convex env)]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Secrets Config Exists and Gitignored: `test -f services/platform/config/secrets.yaml && test -f services/platform/config/.gitignore && grep -q 'secrets.yaml' services/platform/config/.gitignore` → Exit 0 (config file exists and is gitignored)
- Secrets Doctor Resolves All Keys: `bun services/platform/src/cli/holo.ts secrets doctor` → Exit 0 (all required keys resolved)
- Convex Env Aliases Removed: `grep -ri 'CONVEX_URL\|HOLOCRON_URL' app/ holocron-mcp/ services/platform/ | wc -l | grep -q '^0$'` → Exit 0 (zero matches)
- Verify-No-Convex-Env Passes: `bun services/platform/src/cli/holo.ts verify-no-convex-env` → Exit 0 (zero aliases found)
- Secrets Never Committed: `git log --all --full-history -- '*secrets.yaml' | wc -l | grep -q '^0$'` → Exit 0 (zero commits with secrets.yaml)

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: Consolidated secrets is config-hygiene, NOT tenant isolation (AP-7 single-user tailnet); Secrets config file is gitignored, only schema/example is committed; verify-no-convex-env greps real files (app/, holocron-mcp/, services/platform/) - not fake fixtures
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: D01-03

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-04",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "secrets_config_present": {
      "description": "services/platform/config/secrets.yaml exists with required keys",
      "seed_method": "recorded_external",
      "records": [
        "test -f services/platform/config/secrets.yaml exits code 0",
        "grep DATABASE_URL services/platform/config/secrets.yaml prints 1 match",
        "grep MASTRRA_API_KEY services/platform/config/secrets.yaml prints 1 match",
        "grep TAILSCALE_AUTH_KEY services/platform/config/secrets.yaml prints 1 match"
      ]
    },
    "repo_with_convex_env_aliases": {
      "description": "Repository has CONVEX_URL and HOLOCRON_URL aliases in multiple locations",
      "seed_method": "recorded_external",
      "records": [
        "app/.env contains EXPO_PUBLIC_CONVEX_URL=https://holocron.convex.cloud",
        "holocron-mcp/.env contains HOLOCRON_URL=https://holocron.convex.cloud",
        "services/platform/.env contains CONVEX_URL=https://holocron.convex.cloud",
        "grep -ri 'CONVEX_URL|HOLOCRON_URL' returns 3 matches"
      ]
    },
    "repo_clean_of_convex_env": {
      "description": "Repository has no CONVEX_URL or HOLOCRON_URL aliases (post-removal state)",
      "seed_method": "recorded_external",
      "records": [
        "grep -ri 'CONVEX_URL|HOLOCRON_URL' app/ holocron-mcp/ services/platform/ returns (0) matches",
        "grep -c EXPO_PUBLIC_CONVEX_URL app/.env returns 0",
        "git diff shows deletion of all convex aliases",
        "services/platform/config/secrets.yaml exists (consolidated source)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN repo has no consolidated secrets source; config is scattered across env files and hard-coded values WHEN operator creates consolidated secrets config and runs holo secrets doctor THEN services/platform/config/secrets.yaml (or equivalent) exists with required keys (DATABASE_URL, fleet endpoints, etc.); holo secrets doctor reads config and verifies all keys resolve; exits 0; config is portable (same structure works on mini and laptop with different values)",
      "verify": "test -f services/platform/config/secrets.yaml; bun services/platform/src/cli/holo.ts secrets doctor \u2192 Exit 0; output shows all keys resolved",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-017",
        "negative_control": {
          "would_fail_if": [
            "secrets doctor stubbed (always exits code 0)",
            "config file absent (deleted)",
            "required key removed (omitted)",
            "exit code 0 with missing keys (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "secrets_config_present",
            "action": {
              "actor": "operator",
              "steps": [
                "run `bun services/platform/src/cli/holo.ts secrets doctor`",
                "verify output",
                "check exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test -f services/platform/config/secrets.yaml` exits code 0",
                "`bun services/platform/src/cli/holo.ts secrets doctor` exits code 0",
                "output prints `DATABASE_URL: resolved`",
                "output prints `MASTRA_API_KEY: resolved`",
                "output prints `TAILSCALE_AUTH_KEY: resolved`",
                "output prints (0) missing keys"
              ],
              "must_not_observe": [
                "exits code 1 (missing key)",
                "output prints (0) keys resolved (empty output)",
                "any key prints `MISSING` or (0) keys resolved"
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
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN repo has Convex env aliases scattered (EXPO_PUBLIC_CONVEX_URL in app/, HOLOCRON_URL in holocron-mcp/, deploy keys in CI config) WHEN operator greps and removes all Convex env aliases THEN grep -ri 'CONVEX_URL\\|HOLOCRON_URL\\|convex deploy' across app/, holocron-mcp/, services/platform/ returns zero matches; EXPO_PUBLIC_CONVEX_URL removed from app/.env or app.config.js; HOLOCRON_URL removed from holocron-mcp/; CONVEX_DEPLOY_KEY removed from CI config; all code reads from consolidated secrets instead",
      "verify": "grep -ri 'CONVEX_URL\\|HOLOCRON_URL' app/ holocron-mcp/ services/platform/ \u2192 zero matches; bun services/platform/src/cli/holo.ts secrets doctor exits 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-017",
        "negative_control": {
          "would_fail_if": [
            "alias omitted from removal (still present)",
            "grep stubbed (scans fake fixture not real files)",
            "exit code 0 with aliases remaining (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_clean_of_convex_env",
            "action": {
              "actor": "operator",
              "steps": [
                "run `grep -ri 'CONVEX_URL|HOLOCRON_URL' app/ holocron-mcp/ services/platform/`",
                "verify 0 matches",
                "check app/.env specifically"
              ]
            },
            "end_state": {
              "must_observe": [
                "`grep -ri 'CONVEX_URL|HOLOCRON_URL' app/ holocron-mcp/ services/platform/` returns (0) matches",
                "`grep -c EXPO_PUBLIC_CONVEX_URL app/.env` returns 0",
                "`grep -c HOLOCRON_URL holocron-mcp/.env` returns 0",
                "`grep -c CONVEX_URL services/platform/.env` returns 0"
              ],
              "must_not_observe": [
                "grep returns \u22651 match (alias remains)",
                "grep prints EXPO_PUBLIC_CONVEX_URL in app/.env (not removed)",
                "grep prints HOLOCRON_URL in holocron-mcp/.env (not removed)",
                "grep returns (0) matches (all aliases removed)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN operator has removed Convex env aliases WHEN operator runs holo verify-no-convex-env THEN Command greps app/, holocron-mcp/, services/platform/ for CONVEX_URL, HOLOCRON_URL, deploy keys; if zero matches found, exits 0 and prints 'zero Convex env aliases found'; if matches found, exits 1 and prints each alias location; this is a build gate (T-PLAT-017)",
      "verify": "bun services/platform/src/cli/holo.ts verify-no-convex-env \u2192 Exit 0 (after removal); reintroduce EXPO_PUBLIC_CONVEX_URL; run again \u2192 Exit 1 with error message",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-017",
        "negative_control": {
          "would_fail_if": [
            "command absent (not implemented)",
            "grep mocked (always exits code 0)",
            "exit code 0 with aliases present (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_clean_of_convex_env",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo verify-no-convex-env` on clean repo",
                "verify exit code 0",
                "reintroduce alias",
                "run `holo verify-no-convex-env` again",
                "verify exit code 1"
              ]
            },
            "end_state": {
              "must_observe": [
                "clean repo: `holo verify-no-convex-env` exits code 0",
                "reintroduce EXPO_PUBLIC_CONVEX_URL=`https://holocron.convex.cloud` to app/.env",
                "dirty repo: `holo verify-no-convex-env` exits code 1",
                "dirty repo: command prints `Found 1 Convex env alias`",
                "dirty repo: command prints `app/.env: EXPO_PUBLIC_CONVEX_URL`"
              ],
              "must_not_observe": [
                "clean repo: exits code 1 (false negative)",
                "dirty repo: exits code 0 (alias not detected)",
                "command prints (0) aliases found (stubbed)"
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
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN consolidated secrets config contains real secrets (DATABASE_URL, fleet endpoints) WHEN operator commits to repo THEN services/platform/config/secrets.yaml is .gitignore'd; git diff shows no secrets committed; repo contains only config schema/example, not real values",
      "verify": "test -f services/platform/config/.gitignore and grep -q 'secrets.yaml' services/platform/config/.gitignore; git log --all --full-history -- '*secrets.yaml' \u2192 zero matches (never committed)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-017",
        "negative_control": {
          "would_fail_if": [
            "secrets.yaml committed (not gitignored)",
            "gitignore entry omitted (absent)",
            "exit code 0 with committed file (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "secrets_config_present",
            "action": {
              "actor": "operator",
              "steps": [
                "run `git check-ignore services/platform/config/secrets.yaml`",
                "verify file is gitignored",
                "check git history for accidental commits"
              ]
            },
            "end_state": {
              "must_observe": [
                "`git check-ignore services/platform/config/secrets.yaml` exits code 0",
                "`git check-ignore services/platform/config/secrets.yaml` prints `services/platform/config/secrets.yaml`",
                "`grep secrets.yaml .gitignore` returns 1 match",
                "`git log --all --oneline -- '**/secrets.yaml'` returns (0) commits",
                "test -f .git/info/exclude exits code 0 (exclude exists)",
                "grep secrets.yaml .git/info/exclude returns (0) matches (not in exclude)"
              ],
              "must_not_observe": [
                "git check-ignore exits code 1 (not ignored)",
                "git log prints \u22651 secrets.yaml commit (accidentally committed)",
                "git check-ignore prints (0) output (file not in gitignore)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Consolidated secrets config exists and secrets doctor resolves all keys",
      "maps_to_ac": "AC-1",
      "verify": "test -f services/platform/config/secrets.yaml; bun services/platform/src/cli/holo.ts secrets doctor exits 0"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Convex env aliases are removed from repo",
      "maps_to_ac": "AC-2",
      "verify": "grep -ri 'CONVEX_URL\\|HOLOCRON_URL' app/ holocron-mcp/ services/platform/ returns zero matches"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "verify-no-convex-env exits 0 when aliases gone, exits 1 when present",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts verify-no-convex-env exits 0; reintroduce alias; run again exits 1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Secrets config is gitignored and never committed",
      "maps_to_ac": "AC-4",
      "verify": "grep -q 'secrets.yaml' services/platform/config/.gitignore; git log shows no secrets.yaml commits"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Config contract is portable (same structure, different values on mini vs laptop)",
      "maps_to_ac": "AC-1",
      "verify": "On mini: secrets doctor resolves mini DATABASE_URL; on laptop: same command resolves laptop DATABASE_URL"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Secrets doctor fails if required keys missing",
      "maps_to_ac": "AC-1",
      "verify": "Remove DATABASE_URL from secrets; run secrets doctor; exits 1 with missing key error"
    }
  ]
}
-->
</details>