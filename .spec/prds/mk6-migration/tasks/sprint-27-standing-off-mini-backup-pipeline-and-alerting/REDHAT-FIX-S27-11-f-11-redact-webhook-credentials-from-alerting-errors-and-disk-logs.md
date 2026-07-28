# REDHAT-FIX-S27-11 — [F-11] Redact webhook credentials from alerting errors and disk logs

## What this does

postBackupAlert and runBackupAlertSweep never emit the full ALERT_WEBHOOK_URL (path/query/token) into any Error.message, errors[] entry, or AlertSweepResult.webhookUrl field. Failed deliveries surface host-only redaction (e.g. url=https://hooks.slack.com). Non-https remote webhook URLs are rejected fail-closed before fetch, with the same host-only error surface. Loopback http (127.0.0.1 / localhost / ::1) remains allowed for the D04-01 RED receiver. A red_first integration test proves the secret token appears in the error string pre-fix and is absent post-fix.

## Why

- MUST stop interpolating the raw webhook URL into thrown Errors at alerting.ts:356
- MUST ensure runBackupAlertSweep errors[] (alerting.ts:426-427) only ever carries host-redacted messages (the path that lands in launchd backup-alert-sweep.err.log)
- MUST redact AlertSweepResult.webhookUrl so --json CLI output cannot dump the path token
- MUST reject non-https remote schemes (F-12) while preserving loopback http for sprint27-backup-alerting-red.test.ts
- MUST Write RED evidence that currently fails because the secret token is present in err.message, then GREEN with host-only surface
- NEVER log, throw, or return the full hooks.slack.com/.../SECRET or discord .../webhooks/<id>/<token> path
- NEVER weaken delivery (fetch must still POST to the real full URL; only SERIALIZED/emitted surfaces are redacted)
- NEVER swallow delivery failures (STRICT fail-closed remains)
- STRICTLY CAP-BAK-01 boundary: credentials never in logs
- STRICTLY write_allowed limited to alerting.ts + new/updated tests

## How to verify

- PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts → Exit 0
- rg -n 'url=\$\{url\}' services/platform/src/backup/alerting.ts → empty (exit 1) — raw interpolation gone
- rg -n 'redactWebhookUrlForLog|assertAlertWebhookUrlAllowed' services/platform/src/backup/alerting.ts → ≥1 each
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0 (or scoped biome on touched files if repo-wide has pre-existing noise)

## Scope

Writes: services/platform/src/backup/alerting.ts, services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts, .tmp/redhat-fix-s27-11*/**

Prohibited: services/platform/src/cli/holo.ts, services/platform/src/backup/config.ts, services/platform/deploy/launchd/holocron-backup-alert-sweep.plist, services/platform/src/backup/heartbeat.ts, services/platform/src/backup/wal-archive.ts, services/platform/src/backup/base-backup.ts, services/platform/src/backup/restic-mirror.ts, services/platform/src/backup/r2-provision.ts, services/platform/config/**, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-11 — [F-11] Redact webhook credentials from alerting errors and disk logs
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      implementer=mastra-implementer | reviewer=security-reviewer
PROPOSED-BY: security-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
postBackupAlert and runBackupAlertSweep never emit the full ALERT_WEBHOOK_URL (path/query/token) into any Error.message, errors[] entry, or AlertSweepResult.webhookUrl field. Failed deliveries surface host-only redaction (e.g. url=https://hooks.slack.com). Non-https remote webhook URLs are rejected fail-closed before fetch, with the same host-only error surface. Loopback http (127.0.0.1 / localhost / ::1) remains allowed for the D04-01 RED receiver. A red_first integration test proves the secret token appears in the error string pre-fix and is absent post-fix.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Export (or keep module-private but test-visible via behavior) a single redact helper that strips path/query/hash and keeps scheme+host only
- MUST Change postBackupAlert failure Error at alerting.ts:356 to use redact helper — never url=${rawUrl}
- MUST Apply the same redaction to any scheme-validation / URL-parse errors so reject paths also cannot leak tokens
- MUST Redact AlertSweepResult.webhookUrl (and any healthy early-return that still includes webhookUrl) before return
- MUST Validate scheme before fetch: allow https:// always; allow http:// only when hostname is 127.0.0.1, localhost, or ::1; reject everything else fail-closed
- MUST Preserve real fetch(url, ...) with the UNREDACTED url for actual delivery
- MUST Write red_first test that fails if the fixture secret token appears in any thrown/collected error string
- Never interpolate the raw ALERT_WEBHOOK_URL into Error.message, errors[], console output, or result.webhookUrl
- Never accept remote http:// (or other non-https schemes) for production webhooks
- Never stub postBackupAlert to return ok without fetch
- Never modify launchd plist, secrets store, or holo.ts (fix at source in alerting.ts so all callers inherit)
- Never broaden write scope beyond alerting.ts + tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: thrown error never contains full URL path/token
- [ ] AC-2: launchd/errors[]/result.webhookUrl logs only host
- [ ] AC-3: integration test fails if secret token appears in error string
- [ ] AC-4: HTTPS reject non-https except loopback for RED tests
- [ ] AC-5: successful delivery still POSTs to full path
- [ ] PLATFORM_IT=1 vitest redhat-fix-s27-11 green + pnpm tsgo --noEmit clean + biome clean on write_allowed

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Thrown Error from postBackupAlert never contains full URL path/token (flow_ref CAP-BAK-01)
  GIVEN ALERT_WEBHOOK_URL is a Slack-shaped URL with an embedded path secret (https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ) and the webhook sink returns a non-2xx status
  WHEN  postBackupAlert is invoked with a real fetch to a local receiver that responds 500
  THEN  the thrown Error.message includes HTTP status and host-only url=https://hooks.slack.com (or equivalent redact form) and MUST NOT contain SECRET_TOKEN_XYZ, /services/, or any path segment
  TEST_TIER: integration · TDD_STATE: red→green

### AC-2 — runBackupAlertSweep errors[] and result.webhookUrl are host-only (launchd/CLI log safe) (flow_ref CAP-BAK-01)
  GIVEN a sweep with at least one overdue/failed job and a webhook that fails delivery (non-2xx or scheme reject)
  WHEN  runBackupAlertSweep catches the postBackupAlert failure and populates errors[] / returns AlertSweepResult
  THEN  every errors[] string and result.webhookUrl contain at most scheme+host; neither contains the path token; this is the exact string surface that would be written to launchd StandardErrorPath (backup-alert-sweep.err.log) via CLI catch/print
  TEST_TIER: integration · TDD_STATE: red→green

### AC-3 — Integration test fails closed if secret token appears in any error string (negative control) (flow_ref CAP-BAK-01)
  GIVEN fixture webhook URL https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ (or discord-shaped equivalent) used only as the delivery target
  WHEN  the redhat-fix-s27-11 suite forces a delivery failure and inspects Error.message + errors[]
  THEN  assertions require absence of SECRET_TOKEN_XYZ (and path segments); the suite itself is the load-bearing oracle — a regression that re-interpolates url=${url} MUST fail the test
  TEST_TIER: integration · TDD_STATE: red→green

### AC-4 — HTTPS enforcement: reject non-https remote webhooks; allow loopback http for RED (flow_ref CAP-BAK-01)
  GIVEN candidate ALERT_WEBHOOK_URL values of (a) https://hooks.example.invalid/alert (b) http://evil.example/alert (c) http://127.0.0.1:<port>/hook (d) http://localhost:<port>/hook
  WHEN  postBackupAlert (or the pre-fetch assert helper) validates scheme before fetch
  THEN  (a) allowed; (b) rejected with host-only error (no path leak) and no fetch; (c)(d) allowed so sprint27-backup-alerting-red.test.ts continues to work
  TEST_TIER: integration · TDD_STATE: red→green

### AC-5 — Delivery still uses the real full URL (redaction is emission-only) (flow_ref CAP-BAK-01)
  GIVEN a loopback http.Server receiver and a valid https-or-loopback webhook URL that includes a path
  WHEN  postBackupAlert succeeds (2xx)
  THEN  the receiver observes the POST at the full path (credentials still work for delivery); only error/result emission surfaces are redacted
  TEST_TIER: integration · TDD_STATE: red→green

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | postBackupAlert non-2xx Error.message is host-only; SECRET_TOKEN_XYZ absent | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` |
| TC-2 | runBackupAlertSweep errors[] + result.webhookUrl host-only after failed delivery | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` |
| TC-3 | Negative control: suite fails if full hooks.slack.com/.../SECRET appears in error string | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` |
| TC-4 | Remote http rejected; loopback http + https accepted | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` |
| TC-5 | Typecheck + lint clean on touched surfaces | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts
- services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts
- .tmp/redhat-fix-s27-11*/**
writeProhibited:
- services/platform/src/cli/holo.ts
- services/platform/src/backup/config.ts
- services/platform/deploy/launchd/holocron-backup-alert-sweep.plist
- services/platform/src/backup/heartbeat.ts
- services/platform/src/backup/wal-archive.ts
- services/platform/src/backup/base-backup.ts
- services/platform/src/backup/restic-mirror.ts
- services/platform/src/backup/r2-provision.ts
- services/platform/config/**
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/backup/alerting.ts:336-360 — postBackupAlert — F-11 leak at :356 url=${url}; primary fix site
2. services/platform/src/backup/alerting.ts:362-445 — runBackupAlertSweep — errors.push at :426-427 propagates unredacted Error.message; AlertSweepResult.webhookUrl field returns full URL
3. services/platform/src/backup/config.ts:168-169 — R2_ENDPOINT https-only fail-closed pattern to rhyme for F-12 (read-only reference — do not edit)
4. services/platform/deploy/launchd/holocron-backup-alert-sweep.plist:44-45 — StandardErrorPath → ~/Library/Logs/holocron/backup-alert-sweep.err.log is the disk-log sink for uncaught/CLI-printed errors
5. services/platform/src/cli/holo.ts:2233-2257 — backup:alert-sweep --json dumps full AlertSweepResult (includes webhookUrl); catch path prints err.message — both inherit fix if alerting.ts redacts at source
6. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:101-111 — F-11 HIGH + F-12 MEDIUM source-of-truth text
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/security-review-D04-06.md:170-174 — D04-06 MEDIUM-1 admitted no HTTPS fail-closed on webhook (contradicts AC-5 PASS)
8. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:1-50 — Existing RED suite uses loopback http.Server — HTTPS exception MUST preserve this

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED: pre-fix run of redhat-fix-s27-11 shows failure because Error.message contains SECRET_TOKEN_XYZ (capture under .tmp/redhat-fix-s27-11/red.log)
- GREEN: same suite exit 0; Error.message contains host only (capture under .tmp/redhat-fix-s27-11/green.log)
- Static: rg -n 'url=\$\{url\}' services/platform/src/backup/alerting.ts returns no matches
- Static: redact helper + scheme assert present in alerting.ts

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, .spec/reviews/red-hat-sprint27-20260728T054039Z.md
Pattern: Single helper redactWebhookUrlForLog(url: string): string that URL-parses and returns `${protocol}//${host}` (no path/query/hash/userinfo). On parse failure return a constant like '[invalid-webhook-url]' (never echo the raw string). Apply at every emission seam: postBackupAlert throw, scheme-reject throw, AlertSweepResult.webhookUrl assignment. Separate assertAlertWebhookUrlAllowed(url) validates scheme before fetch using config.ts:168-169 rhyme + loopback allowlist.
Pattern source: config.ts:168-169 (https-only R2); CAP-BAK-01 secret-hygiene; F-11/F-12 fix text in red-hat-sprint27 review
Anti-pattern: Truncating the token (hooks.slack.com/services/T…/B…/SECR…) — partial path still leaks structure and may leave recoverable secrets; Hashing the full URL into logs — unnecessary; host is enough for ops diagnosis; Redacting only the throw but leaving result.webhookUrl raw (CLI --json still leaks); Rejecting ALL http including 127.0.0.1 (breaks D04-01 RED suite); Moving the raw URL into a different field name (stub redaction theatre)

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Tests: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: security-reviewer
- Rationale: Implementation is a small, load-bearing redaction + scheme-guard change in production alerting code; mastra-implementer owns the GREEN under red_first TDD. security-reviewer is the proposing authority (F-11/F-12 from red-hat Sprint 27) and the required reviewer so CAP-BAK-01 'credentials never in logs' is adversarially re-checked (no residual path/token in Error.message, errors[], AlertSweepResult.webhookUrl, or launchd err log).
- Proposed by: security-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-05']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-11)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-11",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27-11-slack-secret-webhook": {
      "description": "Slack-shaped ALERT_WEBHOOK_URL with embedded path secret used as the negative-control credential that MUST NOT appear in any error/log surface",
      "seed_method": "public_api",
      "records": [
        "url = https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ",
        "path token SECRET_TOKEN_XYZ is the credential under test",
        "pre-fix defect: alerting.ts:356 interpolates url=${url} into Error.message"
      ]
    },
    "s27-11-discord-secret-webhook": {
      "description": "Discord-shaped webhook URL secondary shape (same redaction rule)",
      "seed_method": "public_api",
      "records": [
        "url = https://discord.com/api/webhooks/111111111111111111/DISCORD_SECRET_TOKEN_ABC",
        "path token DISCORD_SECRET_TOKEN_ABC must not appear in Error.message or errors[]"
      ]
    },
    "s27-11-failing-http-receiver": {
      "description": "Real local http.Server that returns HTTP 500 so postBackupAlert takes the throw path without needing a remote network",
      "seed_method": "public_api",
      "records": [
        "createServer \u2192 res.writeHead(500); res.end('upstream-fail')",
        "bind 127.0.0.1 ephemeral port",
        "NOTE: for AC-1 path-token redaction with a remote-shaped URL, either (1) assert on a constructed Error via a thin test double that forces non-ok after scheme checks while still using the secret URL string in the throw site, OR (2) prefer testing the redaction helper + the throw template by pointing postBackupAlert at a URL whose host is hooks.slack.com is not required if the test injects webhookUrl and mocks fetch \u2014 PREFERRED: stand a loopback receiver AND pass webhookUrl=http://127.0.0.1:<port>/services/T000/B000/SECRET_TOKEN_XYZ so the path secret is real in the URL string while remaining loopback-legal under F-12"
      ]
    },
    "s27-11-loopback-ok-webhook": {
      "description": "Loopback http URL allowed for RED suite parity",
      "seed_method": "public_api",
      "records": [
        "url = http://127.0.0.1:<port>/hook",
        "must pass assertAlertWebhookUrlAllowed and deliver real POST"
      ]
    },
    "s27-11-remote-http-rejected": {
      "description": "Cleartext remote webhook that must be rejected (F-12)",
      "seed_method": "public_api",
      "records": [
        "url = http://evil.example/hooks/SECRET_SHOULD_NOT_LEAK",
        "must throw before fetch; Error.message must not contain SECRET_SHOULD_NOT_LEAK"
      ]
    },
    "s27-11-launchd-err-log-path": {
      "description": "Documented disk sink for sweep errors (read-only reference fixture)",
      "seed_method": "public_api",
      "records": [
        "services/platform/deploy/launchd/holocron-backup-alert-sweep.plist StandardErrorPath = @HOME@/Library/Logs/holocron/backup-alert-sweep.err.log",
        "CLI catch prints err.message / result.errors[] to stderr \u2192 launchd captures",
        "redaction at source in alerting.ts is sufficient; plist not modified"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN ALERT_WEBHOOK_URL is a Slack-shaped URL with an embedded path secret (https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ) and the webhook sink returns a non-2xx status WHEN postBackupAlert is invoked with a real fetch to a local receiver that responds 500 THEN the thrown Error.message includes HTTP status and host-only url=https://hooks.slack.com (or equivalent redact form) and MUST NOT contain SECRET_TOKEN_XYZ, /services/, or any path segment",
      "verify": "",
      "primary": true,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub/static mock hardcodes success without real service",
            "oracle matches unrelated surface markers"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-11-slack-secret-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "execute verify command"
              ]
            },
            "end_state": {
              "must_observe": [
                "GIVEN ALERT_WEBHOOK_URL is a Slack-shaped URL with an embedded path secret (https://hooks.slack.com/services/T00000000/B"
              ],
              "must_not_observe": [
                "silent failure",
                "false-healthy"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a sweep with at least one overdue/failed job and a webhook that fails delivery (non-2xx or scheme reject) WHEN runBackupAlertSweep catches the postBackupAlert failure and populates errors[] / returns AlertSweepResult THEN every errors[] string and result.webhookUrl contain at most scheme+host; neither contains the path token; this is the exact string surface that would be written to launchd StandardErrorPath (backup-alert-sweep.err.log) via CLI catch/print",
      "verify": "",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub/static mock hardcodes success without real service",
            "oracle matches unrelated surface markers"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-11-slack-secret-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "execute verify command"
              ]
            },
            "end_state": {
              "must_observe": [
                "GIVEN a sweep with at least one overdue/failed job and a webhook that fails delivery (non-2xx or scheme reject) WHEN run"
              ],
              "must_not_observe": [
                "silent failure",
                "false-healthy"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN fixture webhook URL https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ (or discord-shaped equivalent) used only as the delivery target WHEN the redhat-fix-s27-11 suite forces a delivery failure and inspects Error.message + errors[] THEN assertions require absence of SECRET_TOKEN_XYZ (and path segments); the suite itself is the load-bearing oracle \u2014 a regression that re-interpolates url=${url} MUST fail the test",
      "verify": "",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub/static mock hardcodes success without real service",
            "oracle matches unrelated surface markers"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-11-slack-secret-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "execute verify command"
              ]
            },
            "end_state": {
              "must_observe": [
                "GIVEN fixture webhook URL https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_XYZ (or discord-shaped equiv"
              ],
              "must_not_observe": [
                "silent failure",
                "false-healthy"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN candidate ALERT_WEBHOOK_URL values of (a) https://hooks.example.invalid/alert (b) http://evil.example/alert (c) http://127.0.0.1:<port>/hook (d) http://localhost:<port>/hook WHEN postBackupAlert (or the pre-fetch assert helper) validates scheme before fetch THEN (a) allowed; (b) rejected with host-only error (no path leak) and no fetch; (c)(d) allowed so sprint27-backup-alerting-red.test.ts continues to work",
      "verify": "",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub/static mock hardcodes success without real service",
            "oracle matches unrelated surface markers"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-11-slack-secret-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "execute verify command"
              ]
            },
            "end_state": {
              "must_observe": [
                "GIVEN candidate ALERT_WEBHOOK_URL values of (a) https://hooks.example.invalid/alert (b) http://evil.example/alert (c) ht"
              ],
              "must_not_observe": [
                "silent failure",
                "false-healthy"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a loopback http.Server receiver and a valid https-or-loopback webhook URL that includes a path WHEN postBackupAlert succeeds (2xx) THEN the receiver observes the POST at the full path (credentials still work for delivery); only error/result emission surfaces are redacted",
      "verify": "",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub/static mock hardcodes success without real service",
            "oracle matches unrelated surface markers"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-11-slack-secret-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "execute verify command"
              ]
            },
            "end_state": {
              "must_observe": [
                "GIVEN a loopback http.Server receiver and a valid https-or-loopback webhook URL that includes a path WHEN postBackupAler"
              ],
              "must_not_observe": [
                "silent failure",
                "false-healthy"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "postBackupAlert non-2xx Error.message is host-only; SECRET_TOKEN_XYZ absent",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "runBackupAlertSweep errors[] + result.webhookUrl host-only after failed delivery",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Negative control: suite fails if full hooks.slack.com/.../SECRET appears in error string",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Remote http rejected; loopback http + https accepted",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck + lint clean on touched surfaces",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform/tests/integration/redhat-fix-s27-11-webhook-url-redaction.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
