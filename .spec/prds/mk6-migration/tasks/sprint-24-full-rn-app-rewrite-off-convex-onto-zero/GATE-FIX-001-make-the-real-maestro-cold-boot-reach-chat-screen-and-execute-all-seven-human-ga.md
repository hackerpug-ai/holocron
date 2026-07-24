# GATE-FIX-001: Make the real Maestro cold boot reach `chat-screen` and execute all seven human-gate steps with non-optional assertions
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `180 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `code-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Fix the real Maestro cold-boot path so the rewritten app reaches `chat-screen`, then execute the full Sprint 24 human gate (seed → cold boot drawer 3 → articles 12 → What's New 5 → rename within 5s → no-convex-client → share Mastra `/article/` URL) with fail-closed, non-optional assertions and a fresh honest gate-results artifact.

## Background
Preserve failure evidence. Prior gate-results pass is INVALID (written_at_commit 4009dd97b43b8d303fa158a536be379d34d65d5c; step 5 evidence: 'full rename maestro flow not re-run this cycle (drawer load proof)'; optional asserts in list-loads/whats-new-loads/drawer chrome masked failures). Actual Maestro runs htg/htg2/htg3/htg4/htg5 never reached chat-screen — see .tmp/s24-htg-fail.png (Expo Dev Client 'There was a problem loading the project' + 'Open in holocron?'), .tmp/s24-boot-fail.png, .tmp/s24-boot4-fail.png, .tmp/s24-fail2.png. drawer-loads-seeded.yml openLink hardcodes 192.168.1.160:8081 — treat as primary cold-boot determinism fix candidate. Success requires ALL 7 human-gate steps honestly green with NON-OPTIONAL assertions including real rename execution. Do NOT author a pass claim against the current broken baseline. Do NOT mark sprint complete from this planning output alone.

## Specification
- **Objective:** Fix the real Maestro cold-boot path so the rewritten app reaches `chat-screen`, then execute the full Sprint 24 human gate (seed → cold boot drawer 3 → articles 12 → What's New 5 → rename within 5s → no-convex-client → share Mastra `/article/` URL) with fail-closed, non-optional assertions and a fresh honest gate-results artifact.
- **Success state:** On a named iOS Simulator after `holo seed:e2e --reset`, Maestro cold boot reaches `chat-screen`; drawer shows 3 seeded conversation rows; Articles shows 12 documents path via Zero; What's New shows 5 feed items path via Zero; rename to `Sprint Planning` reflects within 5s via Zero; `holo verify:no-convex-client` exits 0; share URL contains `/article/` and not `.convex.site`; fresh gate-results.json records all 7 steps pass with non-optional oracle evidence and written_at_commit ≠ 4009dd97 — prior pass claim remains invalid.

## Critical Constraints
### MUST
- MUST make a real Expo Dev Client + Metro cold boot on a named iOS Simulator reach testID `chat-screen` deterministically before any drawer/articles/whats-new/rename oracle
- MUST execute ALL seven human-gate steps against seeded Postgres+Zero with NON-OPTIONAL Maestro assertions (including the full rename flow writing title `Sprint Planning` within 5s via `.maestro/chat/rename-reflects.yml`)
- MUST write a FRESH honest `gate-results.json` from this-cycle evidence only; prior `verdict: pass` at commit `4009dd97b43b8d303fa158a536be379d34d65d5c` is INVALID and must not be reused or treated as green
- MUST preserve immutable failure evidence paths (`.tmp/s24-htg-fail.png`, `.tmp/s24-boot-fail.png`, `.tmp/s24-boot4-fail.png`, `.tmp/s24-fail2.png`) and cite them as RED baseline
- MUST parameterize Metro/Dev-Client open URL (eliminate brittle hardcoded `192.168.1.160:8081` in gate flows if it contributes to 'There was a problem loading the project')
### NEVER
- NEVER mark step 5 rename PASS from drawer-load-only proof or without executing `.maestro/chat/rename-reflects.yml` end-to-end
- NEVER leave human-gate oracle asserts as `optional: true` (missing `chat-screen`, conversation-row 0..2, articles-route, article-card-pressable, whats-new-feed, Sprint Planning must FAIL the run)
- NEVER treat current dishonest `gate-results.json` (`verdict: pass` with evidence 'full rename maestro flow not re-run this cycle (drawer load proof)') as success
- NEVER substitute mocks, static shells, view-injected lists, or historical SUCCESS artifacts for this-cycle Maestro/junit/screenshots
- NEVER hand-write pass artifacts as implementation success without real Maestro exit 0 logs
### STRICTLY
- STRICTLY PRIMARY ACs are test_tier `e2e` on a named iOS Simulator with real Metro, real Expo Dev Client (`com.holocron.app`), seeded Postgres (`holo seed:e2e --reset`), and live Zero — no store mocks
- STRICTLY flow_ref is UC-SYNC-01; gate success requires all 7 human steps honest pass with non-optional assertions
- STRICTLY tdd_mode red_first: capture/reconfirm RED evidence that chat-screen is not visible (htg/htg2/htg3/htg4/htg5 baseline + `.tmp/s24-htg-fail.png`) before implementing boot/assert fixes
- STRICTLY Dev-client chrome (Continue/Close/Open/Reload) may remain optional taps; data oracles may not

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01, CAP-PUB-01
- **Provides:** deterministic-expo-metro-cold-boot-to-chat-screen, non-optional-maestro-human-gate-flows, honest-fresh-gate-results-seven-steps
- **Consumes:** holo-seed-e2e-reset-3-12-5, zero-provider-and-queries, expo-dev-client-bundle-com.holocron.app, maestro-named-ios-simulator, scripts-e2e-provision-and-gate-drivers, S-REWRITE-01-through-05-rewired-clusters
- **Boundary contracts:** seeded-postgres-via-zero-to-visible-chat-drawer-articles-whats-new, human-gate-seven-steps-fail-closed-no-optional-oracle, rename-must-execute-full-maestro-flow-not-drawer-load-proxy, share-url-mastra-article-host-not-convex-site

## Acceptance Criteria
### AC-1: Deterministic Expo/Metro cold boot reaches chat-screen [PRIMARY]
- **GIVEN:** seeded-e2e-substrate is live and cold-boot-failure-baseline proves prior runs never showed chat-screen
- **WHEN:** operator provisions the named iOS Simulator, starts Metro, launches the real Expo Dev Client with a reachable Metro URL, and runs the Sprint 24 cold-boot Maestro entry flow
- **THEN:** testID chat-screen becomes visible within the configured timeout; Expo Dev Client load-error / 'Open in holocron?' deadlock is not the terminal state
- **Test tier:** `e2e`
- **Verification service:** `Maestro + Expo Dev Client + Metro + named iOS Simulator + Zero + seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `bash scripts/e2e/provision-ios-simulator.sh && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/drawer-loads-seeded.yml 2>&1 | tee .tmp/GATE-FIX-001-ac1-coldboot.log; test -f .tmp/GATE-FIX-001-ac1-coldboot.log && ! grep -E 'There was a problem loading the project|App crashed' .tmp/GATE-FIX-001-ac1-coldboot.log && grep -E 'chat-screen|COMPLETED|SUCCESS' .tmp/GATE-FIX-001-ac1-coldboot.log`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Maestro + Expo Dev Client + Metro + named iOS Simulator + Zero + seeded Postgres`
  - **Negative control — would fail if:**
    - disconnect — Metro unreachable or Zero/Postgres down
    - stub — app never mounts chat-screen testID
    - empty — boot lands on blank/error shell
    - mock — Maestro run skipped and log faked
    - static — historical screenshot substituted for this-cycle boot
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-e2e-substrate`:
    - actor: `user`
    - step: provision named iOS Simulator via scripts/e2e/provision-ios-simulator.sh
    - step: ensure Metro is reachable; parameterize openLink Metro URL (no dead 192.168.x hardcode)
    - step: launch Expo Dev Client com.holocron.app pointed at live Metro
    - step: wait for app shell with Maestro extendedWaitUntil on id chat-screen (non-optional)
    - MUST observe:
      - testID `chat-screen` visible within timeout `120000` ms
      - Maestro exit code `0` for cold-boot portion
      - this-cycle screenshot under `.tmp/` or Maestro output showing chat shell
    - MUST NOT observe:
      - text `There was a problem loading the project`
      - stuck dialog `Open in holocron?` as terminal state with `0` chat-screen mounts
      - chat-screen never visible (`0` chat-screen) — htg/htg2/htg3/htg4/htg5 signature
      - empty Expo error shell without app shell

### AC-2: Drawer shows 3 seeded conversations via Zero with non-optional asserts [PRIMARY]
- **GIVEN:** holo seed:e2e --reset created 3 conversations and AC-1 cold boot reached chat-screen
- **WHEN:** user opens the drawer chat list (chat-header-menu-button or screen-header-menu-button → drawer-content)
- **THEN:** exactly 3 conversation-row indices 0..2 are visible via Zero; empty drawer state is absent; conversation-row asserts are non-optional
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres + Maestro iOS Simulator`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/drawer-loads-seeded.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres + Maestro iOS Simulator`
  - **Negative control — would fail if:**
    - disconnect — Postgres not seeded / Zero socket down
    - empty — Zero query returns 0 conversation rows
    - stub — list still convex/react or static array
    - mock — optional:true on conversation-row asserts
    - static — drawer empty shell painted without seed
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-e2e-substrate`:
    - actor: `user`
    - step: run holo seed:e2e --reset
    - step: cold-boot to chat-screen
    - step: open drawer-content
    - step: assert conversation-row index 0, 1, and 2 visible (non-optional)
    - MUST observe:
      - `3` conversation-row indices `0..2` visible
      - testID `drawer-content` visible
      - rows bound to Zero `useQuery` not static array (`3` seeded rows)
    - MUST NOT observe:
      - testID `drawer-content-empty`
      - `0` conversation rows
      - empty drawer with no conversation-row
      - Maestro WARN-only on missing conversation-row

### AC-3: Articles 12 documents and What's New 5 feed items load via Zero
- **GIVEN:** seeded-e2e-substrate with 12 documents and 5 feed items after holo seed:e2e --reset
- **WHEN:** user opens Articles route then What's New feed via Maestro flows with non-optional oracles
- **THEN:** articles-route shows article-card-pressable content from Zero (12 seeded docs path) and whats-new-feed shows seeded feed findings (5 items path); empty states excluded; optional-only WARN is not a pass
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres + Maestro iOS Simulator`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/list-loads.yml && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/subscriptions/whats-new-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres + Maestro iOS Simulator`
  - **Negative control — would fail if:**
    - disconnect — seed not applied or Zero down
    - empty — articles or feed query returns no rows
    - stub — lists rendered from hardcoded fixtures
    - mock — optional asserts only WARN when articles-route/whats-new-feed missing
    - static — empty articles-empty-state accepted as pass
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-e2e-substrate`:
    - actor: `user`
    - step: open holocron://articles or drawer Articles
    - step: assert articles-route and article-card-pressable (non-optional)
    - step: open holocron://whats-new or What's New
    - step: assert whats-new-feed visible (non-optional)
    - MUST observe:
      - testID `articles-route` visible
      - testID `article-card-pressable` visible (seeded documents path; `12` docs from seed)
      - testID `whats-new-feed` visible (seeded feed path; `5` items from seed)
    - MUST NOT observe:
      - testID `articles-empty-state` as sole content
      - empty What's New with `0` findings as success
      - optional-only WARN when `articles-route` or `whats-new-feed` missing
      - `0` article-card-pressable rows

### AC-4: Rename conversation executes fully and reflects within 5s via Zero [PRIMARY]
- **GIVEN:** drawer shows 3 seeded conversation rows after cold boot
- **WHEN:** user long-presses conversation-row index 0, taps action-menu-rename-button, enters Sprint Planning, taps rename-save-button via full `.maestro/chat/rename-reflects.yml`
- **THEN:** title Sprint Planning is visible within 5s SLO; row count remains 3; full rename Maestro flow actually runs (not skipped or proxied by drawer-load proof)
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres + Maestro iOS Simulator`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/rename-reflects.yml 2>&1 | tee .tmp/GATE-FIX-001-ac4-rename.log; test -f .tmp/GATE-FIX-001-ac4-rename.log && grep -E 'Sprint Planning|COMPLETED|SUCCESS' .tmp/GATE-FIX-001-ac4-rename.log && rg -n 'Sprint Planning|rename-save-button|extendedWaitUntil' .maestro/chat/rename-reflects.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres + Maestro iOS Simulator`
  - **Negative control — would fail if:**
    - stub — rename is local-only no-op not persisted
    - mock — mutator mocked success without write
    - disconnect — Zero mutator not wired
    - empty — rename dialog never opens
    - static — step marked pass from drawer load proof only (invalid prior evidence)
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-e2e-substrate`:
    - actor: `user`
    - step: open drawer with 3 conversation-row entries
    - step: longPressOn conversation-row index 0
    - step: tap action-menu-rename-button
    - step: eraseText and inputText Sprint Planning on rename-input
    - step: tap rename-save-button
    - step: wait up to 5s for visible text Sprint Planning
    - MUST observe:
      - visible text `Sprint Planning` within `5s` timeout
      - conversation-row indices `0..2` still present (count stays `3`)
      - screenshot artifact `S-REWRITE-01-AC-2-rename-reflects` or this-cycle equivalent
      - this-cycle Maestro log for `.maestro/chat/rename-reflects.yml` exit code `0`
    - MUST NOT observe:
      - evidence string `full rename maestro flow not re-run this cycle`
      - previous title persisting with `0` updates
      - duplicate row count `4`
      - empty rename dialog never opening (`0` rename-save)

### AC-5: no-convex-client gate and Mastra share URL both pass
- **GIVEN:** rewritten app clusters are on Zero/Hono and a seeded public/publishable document exists
- **WHEN:** operator runs holo verify:no-convex-client and Maestro share-url flow for a seeded document
- **THEN:** no-convex-client exits 0 with zero convex/react imports under app/components/hooks/screens; share URL contains /article/ and does not contain .convex.site or .convex.cloud
- **Test tier:** `e2e`
- **Verification service:** `holo verify:no-convex-client + Maestro share sheet + Mastra /article/ host`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --roots app,components,hooks,screens && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/share-url-mastra.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `holo verify:no-convex-client + Maestro share sheet + Mastra /article/ host`
  - **Negative control — would fail if:**
    - stub — verify command skipped or grepped only one root
    - mock — share URL string hardcoded in test without UI
    - disconnect — platform share path unavailable
    - empty — share sheet shows no URL
    - static — URL still points at .convex.site
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded-e2e-substrate`:
    - actor: `cli_user`
    - step: run holo verify:no-convex-client --roots app,components,hooks,screens
    - step: open articles, open first article-card-pressable, open document-actions-sheet-share
    - step: assert share sheet/link text matches /article/
    - MUST observe:
      - `holo verify:no-convex-client` exit code `0`
      - stdout STATUS `PASS` / convex_react_import_hits=`0`
      - visible share URL matching `/article/`
    - MUST NOT observe:
      - any `convex/react` import hit under app/components/hooks/screens (hits > `0`)
      - text matching `.convex.site`
      - text matching `.convex.cloud`
      - empty share sheet with `0` URL

### AC-6: Fresh honest gate-results with non-optional human-gate Maestro oracles
- **GIVEN:** invalid-prior-gate-claim exists and ACs 1–5 have this-cycle evidence
- **WHEN:** operator hardens gate Maestro flows so oracle asserts for chat-screen, conversation-row 0..2, articles-route, article-card-pressable, whats-new-feed, and rename Sprint Planning are non-optional, re-runs the full 7-step human gate, and writes fresh gate-results.json
- **THEN:** fresh gate-results.json records steps_total=7, steps_passed=7, all executed, with evidence that rename actually ran; no oracle assert is optional:true; written_at_commit differs from 4009dd97; prior claim is not copied as success
- **Test tier:** `e2e`
- **Verification service:** `gate-results.json file artifact + Maestro flow static oracle audit + this-cycle run logs`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json && jq -e '.verdict=="pass" and .steps_total==7 and .steps_passed==7 and .written_at_commit != "4009dd97b43b8d303fa158a536be379d34d65d5c" and (.steps[] | select(.n==5) | .evidence | test("not re-run|drawer load proof") | not)' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `gate-results.json file artifact + Maestro flow static oracle audit + this-cycle run logs`
  - **Negative control — would fail if:**
    - stub — gate-results rewritten to pass without re-running Maestro
    - mock — optional:true remains on conversation-row / chat-screen / articles-route / whats-new-feed oracles
    - static — written_at_commit still 4009dd97 claim reused
    - empty — steps_executed < 7
    - disconnect — human-test logs missing
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `invalid-prior-gate-claim`:
    - actor: `cli_user`
    - step: remove optional:true from human-gate oracle asserts in gate Maestro flows (keep only true optional chrome dismissals: Continue/Close/Open/Reload — never data oracles)
    - step: re-run full 7-step human gate on real simulator
    - step: write fresh gate-results.json with this-cycle commit and honest step 5 rename evidence referencing rename-reflects / Sprint Planning
    - MUST observe:
      - gate-results.json `verdict`=`pass` with `steps_passed`=`7`
      - step `5` evidence mentions `Sprint Planning` or `rename-reflects` artifact
      - `written_at_commit` differs from `4009dd97b43b8d303fa158a536be379d34d65d5c`
      - static audit result `PASS` for non-optional human-gate oracles
    - MUST NOT observe:
      - evidence `full rename maestro flow not re-run this cycle (drawer load proof)`
      - oracle asserts for chat-screen/conversation-row/articles-route/whats-new-feed still `optional: true`
      - copied historical SUCCESS without this-cycle Maestro junit (`0` this-cycle logs)
      - empty step-5 rename evidence

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Cold boot on named iOS Simulator reaches testID chat-screen without Expo load-error terminal state | AC-1 | `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/drawer-loads-seeded.yml` |
| TC-2 | Drawer shows conversation-row indices 0, 1, and 2 after holo seed:e2e --reset | AC-2 | `holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/drawer-loads-seeded.yml` |
| TC-3 | Articles list and What's New feed load seeded content via Zero with non-optional Maestro asserts | AC-3 | `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/list-loads.yml && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/subscriptions/whats-new-loads.yml` |
| TC-4 | Full rename Maestro flow runs and Sprint Planning is visible within 5 seconds while row count stays 3 | AC-4 | `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/rename-reflects.yml` |
| TC-5 | holo verify:no-convex-client exits 0 and share URL contains /article/ not .convex.site | AC-5 | `holo verify:no-convex-client --roots app,components,hooks,screens && MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/share-url-mastra.yml` |
| TC-6 | Fresh gate-results.json is honest seven-step pass not the invalid 4009dd97 claim | AC-6 | `jq -e '.verdict=="pass" and .steps_passed==7 and .written_at_commit != "4009dd97b43b8d303fa158a536be379d34d65d5c" and (.steps[] \| select(.n==5) \| .evidence \| test("not re-run\|drawer load proof") \| not)' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json` |
| TC-7 | Human-gate oracle asserts are non-optional for chat-screen, conversation rows, articles-route, article-card-pressable, whats-new-feed, and rename title | AC-6 | `python3 -c "import re,pathlib,sys; files=['.maestro/chat/drawer-loads-seeded.yml','.maestro/chat/rename-reflects.yml','.maestro/articles/list-loads.yml','.maestro/subscriptions/whats-new-loads.yml']; oids=('chat-screen','conversation-row','articles-route','article-card-pressable','whats-new-feed','Sprint Planning'); fail=[];
for f in files:
 p=pathlib.Path(f);
 lines=p.read_text().splitlines() if p.exists() else [];
 [fail.append(f'{f}:{i+1}') for i,line in enumerate(lines) if any(oid in line for oid in oids) and re.search(r'optional:\\s*true','\\n'.join(lines[i:i+5]))];
sys.exit(1 if fail else 0)"` |

## Reading List
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/SPRINT.md` (all) — Human Testing Gate (7 steps) + Remediation table for GATE-FIX-001; prior completion claim INVALID
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json` (all) — Dishonest verdict pass at written_at_commit 4009dd97; step 5 evidence admits rename not re-run
- `.tmp/s24-htg-fail.png` (all) — Immutable RED: Expo Dev Client load failure; chat-screen never visible
- `.tmp/s24-boot-fail.png` (all) — Additional cold-boot failure artifact (htg series)
- `.tmp/s24-boot4-fail.png` (all) — Additional cold-boot failure artifact
- `.tmp/s24-fail2.png` (all) — Additional cold-boot failure artifact
- `.maestro/chat/drawer-loads-seeded.yml` (all) — Cold boot + drawer 3-row oracles; fix Metro openLink hardcode; remove optional masking of data path
- `.maestro/chat/rename-reflects.yml` (all) — Full rename flow that MUST execute for human-gate step 5 — NEVER skip
- `.maestro/articles/list-loads.yml` (all) — Articles seeded list oracles; harden articles-route / article-card-pressable non-optional
- `.maestro/subscriptions/whats-new-loads.yml` (all) — What's New feed load; harden whats-new-feed assert non-optional
- `.maestro/articles/share-url-mastra.yml` (all) — CAP-PUB-01 share URL must show /article/ not .convex.site
- `scripts/e2e/run-maestro-reference-flow.sh` (all) — Fail-closed Maestro harness patterns, env contracts, artifact isolation
- `scripts/e2e/run-maestro-native-gate.sh` (all) — Per-step native gate driver; simulator/app/backend requirements
- `scripts/e2e/provision-ios-simulator.sh` (all) — Named simulator provision (MAESTRO_DEVICE default)
- `scripts/e2e/reset-and-verify-zero.sh` (all) — Seed + Zero readiness helpers
- `app/_layout.tsx` (all) — Zero provider boot path; no ConvexProvider; cold-boot entry
- `app/(drawer)/_layout.tsx` (all) — Drawer shell, conversation list testIDs, retry chrome
- `.spec/prds/mk6-migration/08-uc-sync.md` (all) — UC-SYNC-01 capability claim this gate proves
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` (all) — T-SYNC-001/002/004/019 e2e criteria
- `RULES.md` (all) — RN testID, ScreenLayout, theme conventions; no fakeable gates

## Guardrails
### WRITE-ALLOWED
- `.maestro/chat/drawer-loads-seeded.yml (MODIFY)`
- `.maestro/chat/rename-reflects.yml (MODIFY)`
- `.maestro/articles/list-loads.yml (MODIFY)`
- `.maestro/subscriptions/whats-new-loads.yml (MODIFY)`
- `.maestro/articles/share-url-mastra.yml (MODIFY)`
- `.maestro/**/*.yml (MODIFY|NEW gate composite flows as needed)`
- `scripts/e2e/run-maestro-native-gate.sh (MODIFY if required for Sprint 24 7-step driver)`
- `scripts/e2e/run-maestro-reference-flow.sh (MODIFY only if cold-boot determinism requires harness fix)`
- `scripts/e2e/provision-ios-simulator.sh (MODIFY if device naming/boot race)`
- `scripts/e2e/reset-and-verify-zero.sh (MODIFY if seed/Zero readiness race)`
- `scripts/e2e/* (MODIFY|NEW only for fail-closed gate drivers supporting this task)`
- `app/_layout.tsx (MODIFY cold-boot / provider readiness only if required to reach chat-screen)`
- `app/(drawer)/_layout.tsx (MODIFY boot/drawer readiness testIDs only if required)`
- `app/(drawer)/chat/** (MODIFY only if missing chat-screen / menu testIDs block gate)`
- `app.config.cjs (MODIFY only if bundleId/dev-client scheme blocks com.holocron.app install)`
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json (MODIFY via honest this-cycle run only)`
- `.tmp/GATE-FIX-001-*/** (NEW evidence logs/screenshots)`
### WRITE-PROHIBITED
- Reusing or copying gate-results.json verdict pass from written_at_commit 4009dd97 without re-run
- Setting optional:true on human-gate oracle asserts (chat-screen, conversation-row, articles-route, article-card-pressable, whats-new-feed, Sprint Planning)
- Mocking Zero/Postgres/Maestro or view-injecting seeded rows
- Deleting immutable RED evidence under .tmp/s24-*-fail.png
- Re-introducing convex/react imports
- Hand-writing gate-results pass without Maestro exit 0 artifacts
- Any file not listed under write_allowed

## Design
- **References:** SPRINT.md § Remediation (GATE-FIX-001), SPRINT.md § Human Testing Gate (7 steps), gate-results.json (INVALID prior pass at 4009dd97), .tmp/s24-htg-fail.png, .tmp/s24-boot-fail.png, .tmp/s24-boot4-fail.png, .tmp/s24-fail2.png, review-artifact.json (contract PASS context; do not weaken CAP-CUT-01)
- **Pattern:** Fail-closed Maestro human gate: real seed → real cold boot to chat-screen → non-optional assertVisible oracles for each of the 7 steps; evidence artifacts this-cycle only
- **Pattern source:** scripts/e2e/run-maestro-reference-flow.sh; Sprint 20 GATE-FIX-G2 this-cycle honesty; .maestro/chat/* flows
- **Anti-pattern:** optional:true Maestro asserts that pass when chat-screen never appears; claiming rename pass without executing rename flow; reusing dishonest gate-results verdict pass; hardcoded dead Metro IP
- **Interaction notes:**
  - Safe areas: chat-screen and drawer must remain usable under SafeArea/ScreenLayout conventions already in shell
  - Touch targets: drawer menu buttons and conversation-row long-press must remain >=44pt
  - Platform: primary verification is iOS Simulator via Maestro; Android not required for this gate
  - Dev-client chrome: Continue/Close/Open/Reload may still be handled as optional chrome only — never the data oracles
  - Metro URL: parameterize via MAESTRO_METRO_URL / LAN :8081 pattern from scripts/e2e; hardcoded 192.168.1.160 in drawer-loads-seeded.yml is a known boot-failure risk matching htg RED screenshots

## Verification Gates
1. **Seed substrate**
   - command: `holo seed:e2e --reset`
   - expected: Exit 0; 3 conversations / 12 documents / 5 feed items
2. **Cold boot + drawer 3 rows**
   - command: `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/drawer-loads-seeded.yml`
   - expected: Exit 0; chat-screen + conversation-row 0..2
3. **Articles list**
   - command: `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/list-loads.yml`
   - expected: Exit 0; articles-route + article-card-pressable
4. **What's New feed**
   - command: `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/subscriptions/whats-new-loads.yml`
   - expected: Exit 0; whats-new-feed visible
5. **Rename within 5s**
   - command: `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/chat/rename-reflects.yml`
   - expected: Exit 0; Sprint Planning visible; 3 rows remain
6. **No Convex client**
   - command: `holo verify:no-convex-client --roots app,components,hooks,screens`
   - expected: Exit 0; convex_react_import_hits=0
7. **Share URL Mastra host**
   - command: `MAESTRO_APP_ID=com.holocron.app maestro test --device "$MAESTRO_DEVICE" .maestro/articles/share-url-mastra.yml`
   - expected: Exit 0; /article/ visible; no .convex.site
8. **Fresh honest gate-results**
   - command: `jq -e '.verdict=="pass" and .steps_passed==7 and .written_at_commit != "4009dd97b43b8d303fa158a536be379d34d65d5c" and (.steps[] | select(.n==5) | .evidence | test("not re-run|drawer load proof") | not)' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json`
   - expected: Exit 0
9. **Typecheck**
   - command: `pnpm tsgo --noEmit`
   - expected: Exit 0
10. **Lint**
   - command: `pnpm biome check .`
   - expected: Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — Owns Expo Dev Client cold-boot surface, chat-screen/drawer testIDs, Maestro human-gate flows under .maestro/, and the RN path that must reach chat-screen against seeded Postgres+Zero. Harness/env scripts under scripts/e2e/ may be adjusted only as needed to make the real boot deterministic; product oracles remain Maestro + holo CLI on real services. Reviewer path: code-reviewer + honest human-gate re-run (not optional chrome-only).
- **Reviewer:** `code-reviewer`

## Dependencies
- **depends_on:** S-REWRITE-01, S-REWRITE-02, S-REWRITE-03, S-REWRITE-04, S-REWRITE-05
- **blocks:** honest-sprint-24-close, Sprint-25, Sprint-26, Sprint-29

## Coding Standards
- `RULES.md`
- `brain/docs/kanban/TASK-TEMPLATE.md`
- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`

## Notes
Preserve failure evidence. Prior gate-results pass is INVALID (written_at_commit 4009dd97b43b8d303fa158a536be379d34d65d5c; step 5 evidence: 'full rename maestro flow not re-run this cycle (drawer load proof)'; optional asserts in list-loads/whats-new-loads/drawer chrome masked failures). Actual Maestro runs htg/htg2/htg3/htg4/htg5 never reached chat-screen — see .tmp/s24-htg-fail.png (Expo Dev Client 'There was a problem loading the project' + 'Open in holocron?'), .tmp/s24-boot-fail.png, .tmp/s24-boot4-fail.png, .tmp/s24-fail2.png. drawer-loads-seeded.yml openLink hardcodes 192.168.1.160:8081 — treat as primary cold-boot determinism fix candidate. Success requires ALL 7 human-gate steps honestly green with NON-OPTIONAL assertions including real rename execution. Do NOT author a pass claim against the current broken baseline. Do NOT mark sprint complete from this planning output alone.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-e2e-substrate": {
      "description": "Postgres nonprod seeded by public CLI with 3 conversations, 12 documents, 5 feed items; Zero cache + platform + Metro up; Expo Dev Client installed as com.holocron.app on named iOS Simulator",
      "seed_method": "public_api",
      "records": [
        "holo seed:e2e --reset creates exactly 3 conversations, 12 documents, 5 feed items",
        "DATABASE_URL targets holocron_nonprod; Zero admin password and platform URL configured",
        "MAESTRO_DEVICE names a bootable iOS Simulator; MAESTRO_APP_ID=com.holocron.app",
        "MAESTRO_METRO_URL (or equivalent) points Dev Client at reachable Metro; not a stale LAN IP"
      ]
    },
    "cold-boot-failure-baseline": {
      "description": "Immutable RED evidence from actual Maestro runs htg/htg2/htg3/htg4/htg5 where chat-screen never became visible",
      "seed_method": "recorded_external",
      "records": [
        ".tmp/s24-htg-fail.png shows Expo Dev Client error 'There was a problem loading the project' and 'Open in holocron?' dialog",
        ".tmp/s24-boot-fail.png, .tmp/s24-boot4-fail.png, .tmp/s24-fail2.png additional cold-boot failures",
        "chat-screen never visible; drawer/articles/whats-new/rename flows did not execute",
        ".maestro/chat/drawer-loads-seeded.yml historically openLink hardcodes http://192.168.1.160:8081 which is a boot-failure risk"
      ]
    },
    "invalid-prior-gate-claim": {
      "description": "Dishonest gate-results.json at written_at_commit 4009dd97 claiming verdict pass without executing rename and with optional asserts",
      "seed_method": "recorded_external",
      "records": [
        "gate-results.json steps[4] (n=5) evidence states 'full rename maestro flow not re-run this cycle (drawer load proof)'",
        "optional:true Maestro asserts in human-gate flows (drawer-loads-seeded Open chrome; list-loads articles oracles; whats-new-loads feed oracles) masked missing elements as WARN",
        "verdict pass / steps_passed 7 / written_at_commit 4009dd97b43b8d303fa158a536be379d34d65d5c is INVALID for sprint close"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN seeded-e2e-substrate is live and cold-boot-failure-baseline proves prior runs never showed chat-screen WHEN operator provisions named iOS Simulator, starts Metro, launches real Expo Dev Client, and runs Sprint 24 cold-boot Maestro entry flow THEN testID chat-screen becomes visible; Expo load-error is not terminal state",
      "verify": "bash scripts/e2e/provision-ios-simulator.sh && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/drawer-loads-seeded.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + Expo Dev Client + Metro + named iOS Simulator + Zero + seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-e2e-substrate",
            "action": {
              "actor": "user",
              "steps": [
                "provision named iOS Simulator",
                "launch Expo Dev Client at live Metro",
                "wait non-optionally for id chat-screen"
              ]
            },
            "end_state": {
              "must_observe": [
                "testID `chat-screen` visible within timeout `120000` ms",
                "Maestro exit code `0` for cold-boot portion",
                "this-cycle screenshot under `.tmp/` or Maestro output showing chat shell"
              ],
              "must_not_observe": [
                "text `There was a problem loading the project`",
                "stuck dialog `Open in holocron?` as terminal state with `0` chat-screen mounts",
                "chat-screen never visible (`0` chat-screen) \u2014 htg/htg2/htg3/htg4/htg5 signature",
                "empty Expo error shell without app shell"
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
      "description": "GIVEN 3 conversations seeded and cold boot reached chat-screen WHEN user opens drawer chat list THEN conversation-row indices 0..2 visible via Zero",
      "verify": "holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/drawer-loads-seeded.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres + Maestro iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "empty",
            "stub",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-e2e-substrate",
            "action": {
              "actor": "user",
              "steps": [
                "open drawer-content",
                "assert conversation-row 0..2 non-optional"
              ]
            },
            "end_state": {
              "must_observe": [
                "`3` conversation-row indices `0..2` visible",
                "testID `drawer-content` visible",
                "rows bound to Zero `useQuery` not static array (`3` seeded rows)"
              ],
              "must_not_observe": [
                "testID `drawer-content-empty`",
                "`0` conversation rows",
                "empty drawer with no conversation-row",
                "Maestro WARN-only on missing conversation-row"
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
      "description": "GIVEN 12 documents and 5 feed items seeded WHEN user opens Articles then What's New THEN articles-route/article-card-pressable and whats-new-feed visible via Zero",
      "verify": "MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/articles/list-loads.yml && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/subscriptions/whats-new-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres + Maestro iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "empty",
            "stub",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-e2e-substrate",
            "action": {
              "actor": "user",
              "steps": [
                "open articles",
                "open whats-new",
                "assert non-optional oracles"
              ]
            },
            "end_state": {
              "must_observe": [
                "testID `articles-route` visible",
                "testID `article-card-pressable` visible (seeded documents path; `12` docs from seed)",
                "testID `whats-new-feed` visible (seeded feed path; `5` items from seed)"
              ],
              "must_not_observe": [
                "testID `articles-empty-state` as sole content",
                "empty What's New with `0` findings as success",
                "optional-only WARN when `articles-route` or `whats-new-feed` missing",
                "`0` article-card-pressable rows"
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
      "description": "GIVEN drawer with 3 seeded rows WHEN user renames row 0 to Sprint Planning via full dialog THEN Sprint Planning visible within 5s and count stays 3",
      "verify": "MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/rename-reflects.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres + Maestro iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "disconnect",
            "empty",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-e2e-substrate",
            "action": {
              "actor": "user",
              "steps": [
                "longPress conversation-row 0",
                "rename to Sprint Planning",
                "save and wait <=5s"
              ]
            },
            "end_state": {
              "must_observe": [
                "visible text `Sprint Planning` within `5s` timeout",
                "conversation-row indices `0..2` still present (count stays `3`)",
                "screenshot artifact `S-REWRITE-01-AC-2-rename-reflects` or this-cycle equivalent",
                "this-cycle Maestro log for `.maestro/chat/rename-reflects.yml` exit code `0`"
              ],
              "must_not_observe": [
                "evidence string `full rename maestro flow not re-run this cycle`",
                "previous title persisting with `0` updates",
                "duplicate row count `4`",
                "empty rename dialog never opening (`0` rename-save)"
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
      "description": "GIVEN rewritten client WHEN verify:no-convex-client and share flow run THEN exit 0 and share URL uses Mastra /article/ host",
      "verify": "holo verify:no-convex-client --roots app,components,hooks,screens && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/articles/share-url-mastra.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "holo verify:no-convex-client + Maestro share sheet + Mastra /article/ host",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "disconnect",
            "empty",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-e2e-substrate",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run no-convex-client verify",
                "share seeded document"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo verify:no-convex-client` exit code `0`",
                "stdout STATUS `PASS` / convex_react_import_hits=`0`",
                "visible share URL matching `/article/`"
              ],
              "must_not_observe": [
                "any `convex/react` import hit under app/components/hooks/screens (hits > `0`)",
                "text matching `.convex.site`",
                "text matching `.convex.cloud`",
                "empty share sheet with `0` URL"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN invalid prior gate claim WHEN full 7-step human gate re-run with non-optional oracles THEN fresh gate-results pass is honest and not 4009dd97",
      "verify": "jq -e '.verdict==\"pass\" and .steps_passed==7 and .written_at_commit != \"4009dd97b43b8d303fa158a536be379d34d65d5c\" and (.steps[] | select(.n==5) | .evidence | test(\"not re-run|drawer load proof\") | not)' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "gate-results.json file artifact + Maestro flow static oracle audit + this-cycle run logs",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "mock",
            "static",
            "empty",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "invalid-prior-gate-claim",
            "action": {
              "actor": "cli_user",
              "steps": [
                "harden non-optional oracles",
                "re-run 7-step gate",
                "write fresh gate-results.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "gate-results.json `verdict`=`pass` with `steps_passed`=`7`",
                "step `5` evidence mentions `Sprint Planning` or `rename-reflects` artifact",
                "`written_at_commit` differs from `4009dd97b43b8d303fa158a536be379d34d65d5c`",
                "static audit result `PASS` for non-optional human-gate oracles"
              ],
              "must_not_observe": [
                "evidence `full rename maestro flow not re-run this cycle (drawer load proof)`",
                "oracle asserts for chat-screen/conversation-row/articles-route/whats-new-feed still `optional: true`",
                "copied historical SUCCESS without this-cycle Maestro junit (`0` this-cycle logs)",
                "empty step-5 rename evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "primary": false,
      "description": "Cold boot on named iOS Simulator reaches testID chat-screen without Expo load-error terminal state",
      "verify": "MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/drawer-loads-seeded.yml",
      "maps_to_ac": "AC-1",
      "scenario": null
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "primary": false,
      "description": "Drawer shows conversation-row indices 0, 1, and 2 after holo seed:e2e --reset",
      "verify": "holo seed:e2e --reset && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/drawer-loads-seeded.yml",
      "maps_to_ac": "AC-2",
      "scenario": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "primary": false,
      "description": "Articles list and What's New feed load seeded content via Zero with non-optional Maestro asserts",
      "verify": "MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/articles/list-loads.yml && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/subscriptions/whats-new-loads.yml",
      "maps_to_ac": "AC-3",
      "scenario": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "primary": false,
      "description": "Full rename Maestro flow runs and Sprint Planning is visible within 5 seconds while row count stays 3",
      "verify": "MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/chat/rename-reflects.yml",
      "maps_to_ac": "AC-4",
      "scenario": null
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "primary": false,
      "description": "holo verify:no-convex-client exits 0 and share URL contains /article/ not .convex.site",
      "verify": "holo verify:no-convex-client --roots app,components,hooks,screens && MAESTRO_APP_ID=com.holocron.app maestro test --device \"$MAESTRO_DEVICE\" .maestro/articles/share-url-mastra.yml",
      "maps_to_ac": "AC-5",
      "scenario": null
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "primary": false,
      "description": "Fresh gate-results.json is honest seven-step pass not the invalid 4009dd97 claim",
      "verify": "jq -e '.verdict==\"pass\" and .steps_passed==7 and .written_at_commit != \"4009dd97b43b8d303fa158a536be379d34d65d5c\"' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/gate-results.json",
      "maps_to_ac": "AC-6",
      "scenario": null
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "primary": false,
      "description": "Human-gate oracle asserts are non-optional for chat-screen, conversation rows, articles-route, whats-new-feed, and rename title",
      "verify": "python3 -c \"import re,pathlib,sys; files=['.maestro/chat/drawer-loads-seeded.yml','.maestro/chat/rename-reflects.yml','.maestro/articles/list-loads.yml','.maestro/subscriptions/whats-new-loads.yml']; oids=('chat-screen','conversation-row','articles-route','article-card-pressable','whats-new-feed','Sprint Planning'); fail=[];\nfor f in files:\n p=pathlib.Path(f);\n lines=p.read_text().splitlines() if p.exists() else [];\n [fail.append(f'{f}:{i+1}') for i,line in enumerate(lines) if any(oid in line for oid in oids) and re.search(r'optional:\\\\s*true','\\\\n'.join(lines[i:i+5]))];\nsys.exit(1 if fail else 0)\"",
      "maps_to_ac": "AC-6",
      "scenario": null
    }
  ]
}
-->
