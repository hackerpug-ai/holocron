# REDHAT-FIX-S27-24 — [R-11] Bound Cloudflare R2 provisioning API fetches with an abort timeout

## What this does

Bound Cloudflare R2 provisioning HTTP (cfApi in r2-provision.ts) so a black-holed api.cloudflare.com cannot hang backup:provision forever; residual F-16-class hang after webhook path was fixed in REDHAT-FIX-S27-14 (R-11).

## Why

Finding R-11 HIGH (bun-reviewer, single-agent LOW confidence but production hang risk). Residual F-16 class after webhook path CLOSED. Gate does not re-provision every run — production backup:provision can hang while gate still passes. Negative controls: unbounded fetch still hangs forever on blackhole; timeout not applied to all cfApi call sites; timeout swallowed as success. Handoff: mastra-implementer → code-reviewer (+ bun-reviewer optional). Evidence dir: .tmp/redhat-fix-s27-24/.

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/r2-provision.ts (MODIFY — cfApi AbortController + timeout resolver + optional baseUrl for tests), services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts (NEW — hang/happy/fail-closed), services/platform/tests/integration/** (NEW/MODIFY timeout tests only as needed), .tmp/redhat-fix-s27-24/** (NEW evidence), .tmp evidence

Prohibited: services/platform/src/backup/alerting.ts — already fixed in REDHAT-FIX-S27-14; do not regress, gate-plan.json / gate-results.json edits as a substitute for the timeout, Mocking fetch/global/undici MockAgent to fake timeout without a real slow server, Claiming gate re-provisions every run so hang is 

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-24 — [R-11] Bound Cloudflare R2 provisioning API fetches with an abort timeout
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (75 min)
AGENT:      implementer=mastra-implementer | reviewer=code-reviewer
PROPOSED-BY: mastra-implementer
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
cfApi (and every provision call site that uses it) aborts around 30s against a non-responsive server; healthy Cloudflare-shaped responses still return ok/result; timeout surfaces as failure not success; source shows AbortController+signal+~30000; typecheck and biome clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST: Wrap cfApi fetch in AbortController with ~30_000 ms default timeout (clearTimeout in finally) — same pattern as postBackupAlert 10s in alerting.ts (REDHAT-FIX-S27-14)
- MUST: Fail closed on abort/timeout: throw a clear abort/timeout Error (or equivalent non-success that callers treat as provision failure) — never return {ok:true} / never swallow
- MUST: Prove with a real local http.Server that intentionally never responds that the cfApi path rejects within the configured timeout (+ small slack), not hang indefinitely
- MUST: Prove happy path still parses a real Cloudflare-shaped JSON success body from a real responding local server (method/headers preserved)
- MUST: Cover every Cloudflare client fetch used by provision (single shared cfApi helper preferred so all call sites inherit signal)
- MUST: Allow test-shortened timeout via explicit option and/or env (e.g. BACKUP_CF_API_TIMEOUT_MS) without changing production default 30s
- MUST: Make the API base URL injectable for tests (options.baseUrl and/or BACKUP_CF_API_BASE_URL) so PLATFORM_IT tests hit 127.0.0.1 hang/happy servers without mocking fetch
- NEVER: Leave fetch without signal/timeout on the Cloudflare provision path
- NEVER: Swallow timeout errors as successful provision / ok:true / empty success result
- NEVER: Mock fetch/global/undici to fake timeout behavior without a real slow socket
- NEVER: Apply timeout only in tests or only on one call site while other cfApi callers remain unbounded
- NEVER: Set production default so low that healthy api.cloudflare.com flakes under normal latency (default ~30s)
- NEVER: Change gate-plan.json or claim gate re-provisions every run as a substitute for the timeout fix
- STRICTLY: Use AbortController + signal on fetch (Bun/Node compatible)
- STRICTLY: PLATFORM_IT=1 integration test with real node:http Server (hang + happy)
- STRICTLY: write_allowed limited to r2-provision.ts, integration timeout tests, and .tmp evidence
- STRICTLY: TDD red_first: timeout test must fail on current unbounded cfApi before implementation lands
- STRICTLY: Mirror REDHAT-FIX-S27-14 pattern: controller + setTimeout(abort) + try/finally clearTimeout + normalize AbortError

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Hung Cloudflare API aborts within timeout bound
- [ ] AC-2: Healthy Cloudflare-shaped response still succeeds
- [ ] AC-3: AbortController wired in production cfApi source for all call sites
- [ ] AC-4: Timeout fails closed for provision callers (not swallowed as success)
- [ ] AC-5: Production default remains ~30s and typecheck/lint stay clean
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Hung Cloudflare API aborts within timeout bound (flow_ref T-PLAT-021)
  GIVEN A real local http.Server accepts connections but never ends the response (hanging_cf_api_server), and cfApi/baseUrl is pointed at that server with a short test timeout (e.g. 2000ms via option/env; production default remains 30s)
  WHEN  cfApi (or an exported testable provision Cloudflare helper that wraps the same fetch) is invoked against the hang URL
  THEN  The promise rejects with abort/timeout-related error within timeout_ms + <=2s slack, and does not remain pending beyond that bound; no hang forever
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-r2-provision
  VERIFY: `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t "timeout"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if fetch has no AbortSignal — hangs forever on blackhole; timeout never fires; test uses fake timers without a real socket; error swallowed as {ok:true} / success; timeout only applied in test harness not production cfApi
  START_REF: hanging_cf_api_server
  MUST_OBSERVE: promise rejected; elapsed_ms <= timeout_ms + 2000; error message matches /abort|timeout|AbortError/i
  MUST_NOT_OBSERVE: promise still pending after bound; return {ok:true}; silent resolve; vitest suite hang / open handle forever
  EVIDENCE: stdout

### AC-2 — Healthy Cloudflare-shaped response still succeeds (flow_ref T-PLAT-021)
  GIVEN Real http.Server returns 200 with Cloudflare v4 envelope {success:true, result:{ id: 'probe' }, errors:[]} (responsive_cf_api_server)
  WHEN  cfApi is invoked with that baseUrl and a valid bearer token string
  THEN  Function returns ok===true, status===200, result populated; receiver captures Authorization Bearer and Content-Type for POST bodies when applicable
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-r2-provision
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t "happy"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout aborts healthy loopback responses; mocked sink without real HTTP; signal aborts before response completes on fast server; parser breaks on valid Cloudflare envelope
  START_REF: responsive_cf_api_server
  MUST_OBSERVE: result.ok === true; result.status === 200; result.result present; captured Authorization Bearer header; no AbortError on healthy path
  MUST_NOT_OBSERVE: AbortError on healthy path; zero captures; ok false on 200 success envelope
  EVIDENCE: api_response

### AC-3 — AbortController wired in production cfApi source for all call sites (flow_ref T-PLAT-021)
  GIVEN r2_provision_source (services/platform/src/backup/r2-provision.ts)
  WHEN  Reviewer inspects cfApi fetch and all Cloudflare API call sites
  THEN  AbortController is constructed, signal passed to fetch, setTimeout ~30_000 (or resolveCfApiTimeoutMs) aborts, finally clearTimeout; no other unbounded fetch to api.cloudflare.com remains in this file's provision path
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-source
  VERIFY: `rg -n "AbortController|signal:|30_000|30000|resolveCfApiTimeoutMs|BACKUP_CF_API_TIMEOUT" services/platform/src/backup/r2-provision.ts && ! rg -n "fetch\(`https://api.cloudflare.com" services/platform/src/backup/r2-provision.ts | rg -v signal`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout only in tests not production code; signal omitted from fetch options; second direct fetch to cloudflare without going through timed cfApi; default timeout left at 0 / undefined
  START_REF: r2_provision_source
  MUST_OBSERVE: AbortController present in cfApi; fetch options include signal; timeout default ~30000; finally clearTimeout
  MUST_NOT_OBSERVE: fetch(url, { method, headers, body }) without signal; unbounded api.cloudflare.com fetch outside timed helper
  EVIDENCE: file_artifact

### AC-4 — Timeout fails closed for provision callers (not swallowed as success) (flow_ref T-PLAT-021)
  GIVEN hanging_cf_api_server and an exported provision caller that uses cfApi (e.g. ensureR2Bucket or mintScopedCredentials) with injectable baseUrl
  WHEN  Caller is invoked against the hang server with short timeout
  THEN  Caller rejects/throws (or returns a non-success that cannot be treated as provisioned); no {ok:true} success path; error text includes abort/timeout semantics
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-r2-provision
  VERIFY: `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t "fail-closed"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if timeout swallowed as success; cfApi catches AbortError and returns {ok:true, result:null}; caller treats empty result as provisioned bucket; hang forever so fail-closed never observed
  START_REF: hanging_cf_api_server
  MUST_OBSERVE: caller throws or rejects; error matches /abort|timeout|AbortError/i; elapsed_ms within bound
  MUST_NOT_OBSERVE: ok:true success object; silent empty credentials treated as success; pending hang
  EVIDENCE: stdout

### AC-5 — Production default remains ~30s and typecheck/lint stay clean (flow_ref T-PLAT-021)
  GIVEN Timeout wiring landed with default 30_000 ms (env/option override only for tests)
  WHEN  Source default + typecheck + biome are verified
  THEN  Default timeout constant/resolver is 30_000; pnpm tsgo --noEmit exit 0; pnpm biome check . exit 0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: toolchain
  VERIFY: `rg -n "30_000|30000" services/platform/src/backup/r2-provision.ts && pnpm tsgo --noEmit && pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if production default left at test-only 2s; type errors from new exports; biome format violations
  START_REF: r2_provision_source
  MUST_OBSERVE: default timeout 30000 present; tsgo exit 0; biome exit 0
  MUST_NOT_OBSERVE: default timeout 2000 as production default only; typecheck errors; biome errors
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | cfApi rejects within timeout+2s slack against a non-responsive HTTP server (blackhole) | AC-1 | `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/s...` |
| TC-2 | cfApi returns ok true for a real 200 Cloudflare-shaped JSON receiver | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.t...` |
| TC-3 | cfApi fetch call site passes AbortController signal and ~30s default | AC-3 | `rg -n "AbortController" services/platform/src/backup/r2-provision.ts && rg -n "signal" services/p...` |
| TC-4 | Provision caller fail-closes on CF API timeout (not ok:true) | AC-4 | `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/s...` |
| TC-5 | Typecheck and biome clean after timeout wiring | AC-5 | `pnpm tsgo --noEmit && pnpm biome check .` |
| TC-6 | RED evidence: current unbounded cfApi fails the hang timeout assertion before fix | AC-1 | `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/s...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/r2-provision.ts (MODIFY — cfApi AbortController + timeout resolver + optional baseUrl for tests)
- services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts (NEW — hang/happy/fail-closed)
- services/platform/tests/integration/** (NEW/MODIFY timeout tests only as needed)
- .tmp/redhat-fix-s27-24/** (NEW evidence)
- .tmp evidence

writeProhibited:
- services/platform/src/backup/alerting.ts — already fixed in REDHAT-FIX-S27-14; do not regress
- gate-plan.json / gate-results.json edits as a substitute for the timeout
- Mocking fetch/global/undici MockAgent to fake timeout without a real slow server
- Claiming gate re-provisions every run so hang is "ok"
- Broad refactors of provisionBackupRepo unrelated to timeout
- vi.mock('@mastra/core') or any framework mock for green

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:122-126 — R-11 — cfApi fetch unbounded (F-16 residual on provision path); fix AbortController + 30s
2. services/platform/src/backup/r2-provision.ts:210-235 — cfApi fetch without AbortController — black-hole hang risk
3. services/platform/src/backup/alerting.ts:210-218,451-512 — Pattern reference: resolveWebhookTimeoutMs + postBackupAlert AbortController 10s (REDHAT-FIX-S27-14)
4. services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts:1-200 — Real hang/happy http.Server integration pattern to reuse for CF API timeout suite
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-14-f-16-bound-webhook-fetch-time-and-prevent-alert-sweep-hangs.md:all — Prior F-16 webhook timeout task — same negative controls and evidence style
6. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-02-provision-encrypted-r2-bucket-scoped-credentials-pgbackrest-repo-config.md:1-120 — CAP-BAK-01 provision foundation; T-PLAT-021 / UC-PLAT-06 grounding

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED hang timeout (must fail before fix): `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t "timeout"` → Pre-fix: non-zero exit / hang assertion fail; post-fix: Exit 0, elapsed within bound
- Timeout integration suite green: `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts` → Exit 0 — timeout + happy + fail-closed
- Source wiring: `rg -n "AbortController|signal:|30_000|30000" services/platform/src/backup/r2-provision.ts` → AbortController + signal + 30s default present in cfApi
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: R-11 red-hat-sprint27-20260728T082702Z, F-16 residual on provision path, REDHAT-FIX-S27-14 webhook AbortController pattern, D04-02 provisionBackupRepo / cfApi, T-PLAT-021, UC-PLAT-06, CAP-BAK-01
Pattern: const timeoutMs = resolveCfApiTimeoutMs(options?.timeoutMs); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const res = await fetch(`${baseUrl}${path}`, { method, headers, body, signal: controller.signal }); ... } catch (err) { if (AbortError||/abort|timeout/i) throw new Error(`cloudflare API timed out after ${timeoutMs}ms ...`, { cause }); throw err; } finally { clearTimeout(timer); }
Anti-pattern: await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers, body }) with no signal — hang forever on black-holed api.cloudflare.com while gate may still pass without re-provision
- Default CF API timeout 30_000ms (finding R-11); optional env BACKUP_CF_API_TIMEOUT_MS and options.timeoutMs for tests only
- Inject base URL via options.baseUrl and/or BACKUP_CF_API_BASE_URL so PLATFORM_IT hang/happy servers work without mocking fetch; production default remains https://api.cloudflare.com/client/v4
- Prefer single shared cfApi helper so mintScopedCredentials, createDurableScopedR2Token, ensureR2Bucket all inherit signal
- On AbortError / timeout: throw Error with clear message (mirror postBackupAlert normalize) so callers fail closed — never {ok:true}
- Export resolveCfApiTimeoutMs and/or cfApi (or a thin test-visible wrapper) only as needed for integration tests; keep secrets out of logs
- Write hang/happy evidence under .tmp/redhat-fix-s27-24/ for reviewer

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- RED hang timeout (must fail before fix): `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t "timeout"` → Pre-fix: non-zero exit / hang assertion fail; post-fix: Exit 0, elapsed within bound
- Timeout integration suite green: `PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts` → Exit 0 — timeout + happy + fail-closed
- Source wiring: `rg -n "AbortController|signal:|30_000|30000" services/platform/src/backup/r2-provision.ts` → AbortController + signal + 30s default present in cfApi
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: code-reviewer
- Rationale: Owns services/platform backup provisioning (r2-provision.ts cfApi). Same AbortController timeout pattern as REDHAT-FIX-S27-14 webhook fix; residual F-16-class hang on Cloudflare provision path.
- Proposed by: mastra-implementer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/TDD-METHODOLOGY.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- services/platform/src/backup/r2-provision.ts
- services/platform/src/backup/alerting.ts (AbortController pattern reference only)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-14']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-24)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-24",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "hanging_cf_api_server": {
      "description": "Real node:http Server on 127.0.0.1 ephemeral port that accepts TCP/request body but never calls res.end \u2014 proves unbounded fetch would hang forever.",
      "seed_method": "public_api",
      "records": [
        "createServer((req,res) => { drain body; intentionally no res.end })",
        "listen on 127.0.0.1:0",
        "point cfApi baseUrl / BACKUP_CF_API_BASE_URL at http://127.0.0.1:<port>"
      ]
    },
    "responsive_cf_api_server": {
      "description": "Real node:http Server returning 200 with Cloudflare v4-shaped JSON {success:true, result:{...}, errors:[]} and capturing method/path/headers/body.",
      "seed_method": "public_api",
      "records": [
        "createServer responds 200 application/json Cloudflare envelope",
        "captures method, url path, Authorization header presence, rawBody",
        "result payload minimal for ensureR2Bucket GET or generic cfApi probe"
      ]
    },
    "r2_provision_source": {
      "description": "Production cfApi implementation and all Cloudflare fetch call sites in r2-provision.ts",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/backup/r2-provision.ts cfApi ~L210-235 (today: fetch without AbortController)",
        "call sites: mintScopedCredentials, createDurableScopedR2Token, ensureR2Bucket (GET/POST)"
      ]
    },
    "webhook_timeout_pattern_ref": {
      "description": "Already-landed AbortController pattern on webhook POST to mirror for CF API",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/backup/alerting.ts postBackupAlert AbortController ~10s + resolveWebhookTimeoutMs",
        "services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts hang/happy real Server pattern",
        "REDHAT-FIX-S27-14 F-16 CLOSED for webhook; residual R-11 on provision"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN hanging real HTTP server WHEN cfApi runs THEN rejects within configured timeout (~30s prod / short in test) with abort/timeout error \u2014 not hang forever",
      "verify": "PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"timeout\"",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-r2-provision",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "unbounded fetch still hangs forever on blackhole",
            "no AbortSignal",
            "ok:true on timeout",
            "fake timers without real socket"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "hanging_cf_api_server",
            "action": {
              "actor": "system",
              "steps": [
                "start hang server",
                "point cfApi baseUrl at hang server",
                "time cfApi call",
                "assert reject within bound"
              ]
            },
            "end_state": {
              "must_observe": [
                "rejected",
                "elapsed_ms <= timeout_ms + 2000",
                "abort/timeout error"
              ],
              "must_not_observe": [
                "pending beyond bound",
                "ok:true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN responsive Cloudflare-shaped real server WHEN cfApi runs THEN ok:true and result parsed; Authorization header observed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"happy\"",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-r2-provision",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "timeout aborts healthy post",
            "mock sink",
            "parser regression"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "responsive_cf_api_server",
            "action": {
              "actor": "system",
              "steps": [
                "start 200 CF envelope server",
                "cfApi probe",
                "assert capture + ok"
              ]
            },
            "end_state": {
              "must_observe": [
                "ok true",
                "status 200",
                "result present",
                "Authorization Bearer captured"
              ],
              "must_not_observe": [
                "AbortError",
                "zero captures"
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
      "description": "GIVEN r2-provision.ts WHEN inspecting cfApi THEN AbortController+signal+~30s timeout present and applied to all Cloudflare fetch call sites",
      "verify": "rg -n \"AbortController|signal:|30_000|30000\" services/platform/src/backup/r2-provision.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-source",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "timeout not applied to all cfApi call sites",
            "timeout only in test harness",
            "signal omitted from fetch"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_provision_source",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg AbortController in cfApi",
                "confirm signal on fetch",
                "confirm default 30000"
              ]
            },
            "end_state": {
              "must_observe": [
                "AbortController",
                "signal",
                "~30000 timeout",
                "clearTimeout finally"
              ],
              "must_not_observe": [
                "fetch without signal",
                "second unbounded cloudflare fetch"
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
      "description": "GIVEN hanging CF API WHEN provision caller (ensureR2Bucket/mintScopedCredentials) runs THEN fails closed with abort/timeout \u2014 timeout not swallowed as success",
      "verify": "PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"fail-closed\"",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-r2-provision",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "timeout swallowed as success",
            "return {ok:true} on AbortError",
            "hang forever"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "hanging_cf_api_server",
            "action": {
              "actor": "system",
              "steps": [
                "call ensureR2Bucket or mintScopedCredentials against hang",
                "assert throw"
              ]
            },
            "end_state": {
              "must_observe": [
                "throw/reject",
                "abort/timeout message"
              ],
              "must_not_observe": [
                "ok:true",
                "silent success"
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
      "description": "GIVEN timeout wiring WHEN typecheck+lint+default constant inspected THEN default 30s and toolchain exit 0",
      "verify": "rg -n \"30_000|30000\" services/platform/src/backup/r2-provision.ts && pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "toolchain",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "production default is test-only 2s",
            "typecheck fails",
            "biome fails"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_provision_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "rg 30_000",
                "tsgo",
                "biome"
              ]
            },
            "end_state": {
              "must_observe": [
                "30000 default",
                "exit 0 typecheck",
                "exit 0 lint"
              ],
              "must_not_observe": [
                "type errors",
                "biome errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "cfApi rejects within timeout+slack against non-responsive HTTP server",
      "verify": "PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"timeout\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "cfApi returns ok true for real 200 Cloudflare-shaped receiver",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"happy\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "cfApi fetch passes AbortController signal and 30s default",
      "verify": "rg -n \"AbortController\" services/platform/src/backup/r2-provision.ts && rg -n \"signal\" services/platform/src/backup/r2-provision.ts && rg -n \"30_000|30000\" services/platform/src/backup/r2-provision.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Provision caller fail-closes on CF API timeout",
      "verify": "PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"fail-closed\"",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck and biome clean",
      "verify": "pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED: hang timeout test fails before AbortController implementation",
      "verify": "PLATFORM_IT=1 BACKUP_CF_API_TIMEOUT_MS=2000 pnpm vitest run services/platform/tests/integration/sprint27-r2-provision-timeout.test.ts -t \"timeout\" ; test $? -ne 0",
      "maps_to_ac": "AC-1"
    }
  ],
  "proposed_by": "mastra-implementer",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

