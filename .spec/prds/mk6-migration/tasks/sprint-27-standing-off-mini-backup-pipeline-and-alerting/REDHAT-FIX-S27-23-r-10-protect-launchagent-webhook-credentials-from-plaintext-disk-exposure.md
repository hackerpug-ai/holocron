# REDHAT-FIX-S27-23 — [R-10] Protect LaunchAgent webhook credentials from plaintext disk exposure

## What this does

Stops installAlertSweepLaunchd from baking the full ALERT_WEBHOOK_URL (Slack/Discord path token) into a plaintext LaunchAgent plist without secret hygiene. Preferred: load webhook from secrets store at process start (mirror restic / resolveAlertWebhookUrl secrets path) so the installed plist does not need the live token. If env is still required for launchd, write the plist with mode 0o600 and redact launchctl/gate evidence. Also folds R-12: call assertAlertWebhookUrlAllowed before plist write.

## Why

R-10 HIGH: production webhook path tokens become disk secrets under ~/Library/LaunchAgents/, visible to launchctl print and backups. Evidence: alerting.ts:1159-1161 embeds ALERT_WEBHOOK_URL; writeFileSync at :1325 without mode 0o600; step9.log dumps ALERT_WEBHOOK_URL => http://…. R-12 MEDIUM residual: install only checks length≥8 and skips scheme assert.

## How to verify

PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts → Exit 0; assert plist mode and absence or redaction of secret token; pnpm tsgo --noEmit; pnpm biome check .

## Scope

services/platform/src/backup/alerting.ts install/render paths + new integration test; portable deploy template may keep placeholders only (never live tokens).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-23 — [R-10] Protect LaunchAgent webhook credentials from plaintext disk exposure
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=security-reviewer
PROPOSED-BY: security-reviewer
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
installAlertSweepLaunchd either omits live token from plist and loads from secrets at process start, or writes 0o600 plist only after scheme assert; integration suite proves secret token is absent from unprotected artifacts and present only via secrets/runtime resolution; alert delivery still works; typecheck and lint clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST stop writing full production webhook path tokens into LaunchAgent EnvironmentVariables without secret hygiene (alerting.ts:1159-1161, write at :1325)
- MUST prefer loading ALERT_WEBHOOK_URL from secrets store at process start for backup:alert-sweep (mirror restic / getSecretValue pattern already in resolveAlertWebhookUrl)
- MUST if env still required in plist: writeFileSync(plistPath, body, { encoding: 'utf8', mode: 0o600 }) and ensure directory permissions do not undo protection
- MUST redact full webhook token from install messages, launchctl evidence, and gate-visible dumps (messages already claim 'value redacted' — enforce in artifacts)
- MUST fold R-12: call assertAlertWebhookUrlAllowed (or equivalent scheme gate) before writing the LaunchAgent plist — reject remote http and non-https with host-only error surface
- MUST preserve loopback http allowlist for RED receivers used by D04-01 / gate step 9
- MUST Write red_first integration test that fails when full webhook token is written to plist EnvironmentVariables in plaintext without 0o600 / without secrets-store load
- Never commit live webhook tokens into services/platform/deploy/launchd/*.plist (placeholders only)
- Never leave writeFileSync(plistPath, body, 'utf8') without mode 0o600 if the plist contains any secret material
- Never log or return the full ALERT_WEBHOOK_URL path token from installAlertSweepLaunchd messages
- Never weaken postBackupAlert delivery — runtime must still resolve the real full URL to POST
- Never stub install to report webhookConfigured:true without writing a real plist when bootstrap path is under test
- Never skip scheme assert on install (R-12)
- STRICTLY CAP-BAK-01 credentials never in unprotected disk artifacts
- STRICTLY preserve finding severity HIGH for R-10; R-12 may be folded as AC but remains fail-closed scheme assert
- STRICTLY primary ACs are integration against real filesystem plist under a temp LaunchAgents dir

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Install does not leave full webhook token in unprotected LaunchAgent env
- [ ] AC-2: Secrets-at-process-start mirror (preferred path)
- [ ] AC-3: Plist write uses 0o600 when secret material present
- [ ] AC-4: R-12 fold — scheme assert before plist write
- [ ] AC-5: Negative control — plaintext token without 0o600 / without secrets load fails suite
- [ ] AC-6: Portable deploy template never embeds live tokens
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Install does not leave full webhook token in unprotected LaunchAgent env (flow_ref CAP-BAK-01)
  GIVEN ALERT_WEBHOOK_URL is a secret-shaped URL (https://hooks.slack.com/services/T000/B000/SECRET_TOKEN_LAUNCHD_XYZ or discord equivalent) resolvable via env or secrets fixture
  WHEN  installAlertSweepLaunchd writes a real plist under a temp launchAgentsDir (bootstrap optional false for unit of install)
  THEN  either (preferred) the installed plist EnvironmentVariables does NOT contain the full secret path token and the sweep process resolves webhook via secrets/env at start, OR if the token must be in EnvironmentVariables the plist file mode is 0o600 and the token is never written with default umask 0644
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-launchd-plist
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-1'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if full webhook token written to plist EnvironmentVariables in plaintext without 0o600; without secrets-store load and without mode 0o600; test only checks messages string 'value redacted' while file still contains SECRET_TOKEN_LAUNCHD_XYZ mode 0644
  START_REF: s27-23-secret-webhook-url
  MUST_OBSERVE: install ok true and webhookConfigured true when URL valid; either SECRET_TOKEN_LAUNCHD_XYZ absent from plist body OR (mode & 0o777) === 0o600 with secrets-store or env load documented
  MUST_NOT_OBSERVE: SECRET_TOKEN_LAUNCHD_XYZ present in plist with mode 0644/0666; install claims redacted while file stores full token world-readable
  EVIDENCE: file_artifact

### AC-2 — Secrets-at-process-start mirror (preferred path) (flow_ref CAP-BAK-01)
  GIVEN webhook exists only in secrets store (or HOLO secrets fixture), not required as permanent plist secret if design chooses omit-from-plist
  WHEN  backup:alert-sweep / postBackupAlert / runBackupAlertSweep resolve URL at process start
  THEN  resolveAlertWebhookUrl (or equivalent) loads from secrets; install may wire HOME/HOLO_ROOT/DATABASE_URL without embedding the live path token; delivery still POSTs to full URL
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-2'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if runtime only works when plist embeds full token and ignores secrets store; install succeeds mute (no webhook resolution path) while claiming webhookConfigured true
  START_REF: s27-23-secrets-only-webhook
  MUST_OBSERVE: POST delivered to receiver with full path; secrets-store load used when env empty
  MUST_NOT_OBSERVE: mute install with no resolution path; SECRET_TOKEN_LAUNCHD_XYZ in install messages
  EVIDENCE: api_response

### AC-3 — Plist write uses 0o600 when secret material present (flow_ref CAP-BAK-01)
  GIVEN chosen design path still places ALERT_WEBHOOK_URL in EnvironmentVariables for launchd inheritance
  WHEN  writeFileSync writes the installed plist
  THEN  file mode is 0o600 (owner read/write only); regression to utf8-only write without mode fails the suite
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-launchd-plist
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-3'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if writeFileSync(plistPath, body, 'utf8') without mode when body contains secret; mode 0o644 after install
  START_REF: s27-23-secret-webhook-url
  MUST_OBSERVE: if secret in plist: (mode & 0o777) === 0o600
  MUST_NOT_OBSERVE: mode 0o644 with secret token present
  EVIDENCE: file_artifact

### AC-4 — R-12 fold — scheme assert before plist write (flow_ref CAP-BAK-01)
  GIVEN candidate webhook URLs of (a) https://hooks.example.invalid/alert (b) http://evil.example/hooks/SECRET (c) http://127.0.0.1:<port>/hook
  WHEN  installAlertSweepLaunchd validates before writing plist
  THEN  (a) allowed; (b) rejected fail-closed with no plist write containing SECRET and host-only error; (c) allowed for RED; length≥8 alone is insufficient
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-launchd-plist
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-4'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if install only checks length>=8 and writes remote http webhook into plist; assertAlertWebhookUrlAllowed remains only in postBackupAlert
  START_REF: s27-23-remote-http-webhook
  MUST_OBSERVE: install fails closed for remote http; error surface host-only (no SECRET leak)
  MUST_NOT_OBSERVE: plist written with http://evil.example/hooks/SECRET; ok true for remote http
  EVIDENCE: stdout

### AC-5 — Negative control — plaintext token without 0o600 / without secrets load fails suite (flow_ref CAP-BAK-01)
  GIVEN the redhat-fix-s27-23 suite encodes R-10 (full webhook token in EnvironmentVariables + write without mode 0o600)
  WHEN  suite runs against pre-fix code or a regression that reintroduces plaintext disk exposure
  THEN  suite MUST fail; RED evidence captures SECRET_TOKEN_LAUNCHD_XYZ in plist or mode != 0o600 without secrets-only design
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-launchd-plist
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-5'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if full webhook token written to plist EnvironmentVariables in plaintext without 0o600; without secrets-store load; oracle only greps 'value redacted' in messages
  START_REF: s27-23-secret-webhook-url
  MUST_OBSERVE: suite exit 0 only when R-10 contract holds
  MUST_NOT_OBSERVE: suite greens while plist stores SECRET_TOKEN_LAUNCHD_XYZ mode 0644
  EVIDENCE: stdout

### AC-6 — Portable deploy template never embeds live tokens (flow_ref CAP-BAK-01)
  GIVEN writeTemplate true (default) rewrites services/platform/deploy/launchd portable template
  WHEN  installAlertSweepLaunchd runs with a secret URL
  THEN  portable template still contains @ALERT_WEBHOOK_URL@ placeholder (or omits live secret); never SECRET_TOKEN_LAUNCHD_XYZ
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem-launchd-plist
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-6'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if portable template written with live secret token; template committed with production webhook
  START_REF: s27-23-secret-webhook-url
  MUST_OBSERVE: @ALERT_WEBHOOK_URL@ present OR no webhook env key with live secret
  MUST_NOT_OBSERVE: SECRET_TOKEN_LAUNCHD_XYZ in portable template
  EVIDENCE: file_artifact


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Installed LaunchAgent plist either omits the secret path token or stores it only with mode 0o600 | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-2 | Webhook resolves from secrets at process start when env is empty and delivery still POSTs full path | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-3 | Plist file mode is 0o600 when secret material is present in EnvironmentVariables | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-4 | installAlertSweepLaunchd rejects remote http webhook before writing plist | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-5 | Suite fails when full webhook token is written plaintext without 0o600 and without secrets-store load | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-6 | Portable deploy template does not embed SECRET_TOKEN_LAUNCHD_XYZ | AC-6 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webho...` |
| TC-7 | Typecheck and lint are clean on write_allowed surfaces | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (MODIFY)
- services/platform/deploy/launchd/holocron-backup-alert-sweep.plist (MODIFY — placeholders only if needed)
- services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts (NEW)
- .tmp/redhat-fix-s27-23*/** (NEW evidence)

writeProhibited:
- services/platform/src/cli/holo.ts — inherit fix from alerting install; avoid CLI-only theatre
- services/platform/src/backup/heartbeat.ts
- services/platform/src/backup/wal-archive.ts
- services/platform/src/backup/base-backup.ts
- services/platform/src/backup/restic-mirror.ts — read-only pattern reference
- services/platform/src/backup/r2-provision.ts — read-only pattern reference
- services/platform/config/**
- operator real ~/Library/LaunchAgents/** — tests must use temp launchAgentsDir only

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/backup/alerting.ts:1120-1178 — renderAlertSweepPlist EnvironmentVariables.ALERT_WEBHOOK_URL at 1159-1161
2. services/platform/src/backup/alerting.ts:1200-1378 — installAlertSweepLaunchd — length>=8 only at 1236; writeFileSync without 0o600 at 1325; R-12 scheme assert missing
3. services/platform/src/backup/alerting.ts:287-303 — resolveAlertWebhookUrl env > secrets — process-start load pattern to mirror
4. services/platform/src/backup/restic-mirror.ts:61-80 — writeFileSync mode 0o600 pattern for secret-adjacent config files
5. services/platform/src/backup/r2-provision.ts:185-210 — secrets.yaml upsert with mode 0o600
6. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:116-131 — R-10 HIGH + R-12 MEDIUM source-of-truth
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-11-f-11-redact-webhook-credentials-from-alerting-errors-and-disk-logs.md:1-80 — Prior redact/scheme work (F-11/F-12) — install path residual is R-10/R-12

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED then GREEN integration suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts` → Exit 0 after fix; pre-fix RED fails on plaintext token / missing 0o600
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0 (or scoped biome on write_allowed if repo-wide pre-existing noise)
- Static: install calls scheme assert: `rg -n 'assertAlertWebhookUrlAllowed|installAlertSweepLaunchd' services/platform/src/backup/alerting.ts` → scheme assert invoked on install path before write
- Static: 0o600 on secret-bearing plist write if env still used: `rg -n 'writeFileSync\(plistPath' -A3 services/platform/src/backup/alerting.ts` → mode: 0o600 present if body may contain secrets

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, .spec/reviews/red-hat-sprint27-20260728T082702Z.md (R-10, R-12), REDHAT-FIX-S27-11 redact + scheme assert, restic-mirror / r2-provision 0o600 secrets pattern
Pattern: const alertWebhookUrl = resolveAlertWebhookUrl(...); assertAlertWebhookUrlAllowed(alertWebhookUrl); /* prefer omit from plist */ writeFileSync(plistPath, body, { encoding: 'utf8', mode: 0o600 }); messages.push('wired webhook (value redacted / secrets-at-start)');
Anti-pattern: writeFileSync(plistPath, body, 'utf8') with embedded Slack/Discord path token (R-10); length>=8 only scheme check (R-12); messages claim 'value redacted' while launchctl print / step9.log show full URL; committing live tokens into deploy/launchd template
- Preferred design: omit live ALERT_WEBHOOK_URL from plist EnvironmentVariables; ensure launchd job inherits enough context (HOME, HOLO_ROOT, PATH, DATABASE_URL) that resolveAlertWebhookUrl can read secrets.yaml at process start
- Fallback design: keep EnvironmentVariables.ALERT_WEBHOOK_URL but writeFileSync(..., { mode: 0o600 }) and redact all install/launchctl/gate dumps
- Gate step9 may need to assert webhookConfigured without dumping full URL (coordinate if step9.log currently greps the secret)

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- RED then GREEN integration suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts` → Exit 0 after fix; pre-fix RED fails on plaintext token / missing 0o600
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0 (or scoped biome on write_allowed if repo-wide pre-existing noise)
- Static: install calls scheme assert: `rg -n 'assertAlertWebhookUrlAllowed|installAlertSweepLaunchd' services/platform/src/backup/alerting.ts` → scheme assert invoked on install path before write
- Static: 0o600 on secret-bearing plist write if env still used: `rg -n 'writeFileSync\(plistPath' -A3 services/platform/src/backup/alerting.ts` → mode: 0o600 present if body may contain secrets

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: security-reviewer
- Rationale: Production change to installAlertSweepLaunchd / renderAlertSweepPlist / process-start webhook resolution; mastra-implementer implements secrets-at-start + 0o600 + scheme assert under red_first TDD.
- Proposed by: security-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- brain/docs/ANTI-STUB-REVIEW.md
- brain/docs/TDD-METHODOLOGY.md
- services/platform conventions

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-05', 'REDHAT-FIX-S27-10', 'REDHAT-FIX-S27-11']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-23)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-23",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27-23-secret-webhook-url": {
      "description": "Slack-shaped ALERT_WEBHOOK_URL with path secret used as the R-10 disk-exposure oracle",
      "seed_method": "public_api",
      "records": [
        "url = https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_LAUNCHD_XYZ",
        "path token SECRET_TOKEN_LAUNCHD_XYZ must not appear in world-readable LaunchAgent artifacts",
        "pre-fix defect: renderAlertSweepPlist embeds alertWebhookUrl at EnvironmentVariables; writeFileSync(plistPath, body, 'utf8') without mode 0o600 at alerting.ts:1325"
      ]
    },
    "s27-23-secrets-only-webhook": {
      "description": "Webhook present only in secrets store fixture for process-start resolution",
      "seed_method": "public_api",
      "records": [
        "secrets.yaml / test secretsPath: ALERT_WEBHOOK_URL = http://127.0.0.1:<port>/hook/SECRET_TOKEN_LAUNCHD_XYZ (loopback-legal)",
        "process.env.ALERT_WEBHOOK_URL unset for resolve path under test",
        "loopback http.Server receiver for delivery proof"
      ]
    },
    "s27-23-remote-http-webhook": {
      "description": "R-12 remote cleartext webhook that install must reject",
      "seed_method": "public_api",
      "records": [
        "url = http://evil.example/hooks/SECRET_SHOULD_NOT_LAND_ON_DISK",
        "must fail install before plist write; Error/messages must not leak full secret path if echoed"
      ]
    },
    "s27-23-temp-launch-agents-dir": {
      "description": "Isolated LaunchAgents directory so tests never touch the operator's real ~/Library/LaunchAgents",
      "seed_method": "public_api",
      "records": [
        "mkdtemp under .tmp/redhat-fix-s27-23/LaunchAgents",
        "installAlertSweepLaunchd({ launchAgentsDir, bootstrap: false, holoRoot: temp })",
        "cleanup after suite"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a secret-shaped ALERT_WEBHOOK_URL WHEN installAlertSweepLaunchd writes a real plist under a temp launchAgentsDir THEN either the full path token is absent from EnvironmentVariables (secrets loaded at process start) OR if present the plist mode is 0o600 \u2014 never plaintext world-readable",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-1'",
      "primary": true,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-launchd-plist",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "full webhook token written to plist EnvironmentVariables in plaintext without 0o600",
            "without secrets-store load and without mode 0o600"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-secret-webhook-url",
            "action": {
              "actor": "operator",
              "steps": [
                "create temp launchAgentsDir",
                "installAlertSweepLaunchd with secret URL",
                "read plist body + fs.stat mode"
              ]
            },
            "end_state": {
              "must_observe": [
                "SECRET_TOKEN_LAUNCHD_XYZ absent from plist OR mode 0o600"
              ],
              "must_not_observe": [
                "SECRET_TOKEN_LAUNCHD_XYZ present in plist with mode 0644"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN webhook exists in secrets store WHEN alert sweep resolves URL at process start THEN secrets load works and delivery POSTs full path without requiring unprotected disk token",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-2'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "runtime only works when plist embeds full token",
            "mute install claims webhookConfigured true with no resolution path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-secrets-only-webhook",
            "action": {
              "actor": "daemon",
              "steps": [
                "seed secrets fixture",
                "resolve webhook and postBackupAlert to loopback receiver"
              ]
            },
            "end_state": {
              "must_observe": [
                "POST delivered to receiver",
                "secrets-store load used when env empty"
              ],
              "must_not_observe": [
                "SECRET_TOKEN_LAUNCHD_XYZ in install messages"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN design path places ALERT_WEBHOOK_URL in EnvironmentVariables WHEN plist is written THEN mode is 0o600",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-3'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-launchd-plist",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "writeFileSync without mode when body contains secret",
            "mode 0o644 after install"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-secret-webhook-url",
            "action": {
              "actor": "operator",
              "steps": [
                "install with secret URL",
                "stat plist mode"
              ]
            },
            "end_state": {
              "must_observe": [
                "if secret in plist: mode 0o600"
              ],
              "must_not_observe": [
                "mode 0o644 with secret present"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN remote http vs https vs loopback http webhooks WHEN installAlertSweepLaunchd runs THEN remote http rejected before plist write (R-12); https and loopback allowed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-4'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-launchd-plist",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "install only checks length>=8",
            "remote http webhook written into plist"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-remote-http-webhook",
            "action": {
              "actor": "operator",
              "steps": [
                "install with remote http webhook",
                "assert fail-closed"
              ]
            },
            "end_state": {
              "must_observe": [
                "install fails for remote http"
              ],
              "must_not_observe": [
                "plist written with evil.example secret path",
                "ok true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN the suite encodes R-10 WHEN regression reintroduces full webhook token in plist plaintext without 0o600 / without secrets-store load THEN suite fails",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-5'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-launchd-plist",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "full webhook token written to plist EnvironmentVariables in plaintext without 0o600",
            "without secrets-store load"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-secret-webhook-url",
            "action": {
              "actor": "reviewer",
              "steps": [
                "run suite negative control"
              ]
            },
            "end_state": {
              "must_observe": [
                "suite exit 0 only when R-10 contract holds"
              ],
              "must_not_observe": [
                "suite greens with SECRET_TOKEN_LAUNCHD_XYZ mode 0644"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "GIVEN writeTemplate true WHEN install runs with a secret URL THEN portable template keeps placeholders and never embeds SECRET_TOKEN_LAUNCHD_XYZ",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-6'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-launchd-plist",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "portable template written with live secret token"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-23-secret-webhook-url",
            "action": {
              "actor": "operator",
              "steps": [
                "install with writeTemplate true",
                "inspect portable template"
              ]
            },
            "end_state": {
              "must_observe": [
                "@ALERT_WEBHOOK_URL@ or no live secret"
              ],
              "must_not_observe": [
                "SECRET_TOKEN_LAUNCHD_XYZ in portable template"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Installed LaunchAgent plist either omits the secret path token or stores it only with mode 0o600",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Webhook resolves from secrets at process start when env is empty and delivery still POSTs full path",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Plist file mode is 0o600 when secret material is present in EnvironmentVariables",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "installAlertSweepLaunchd rejects remote http webhook before writing plist",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Suite fails when full webhook token is written plaintext without 0o600 and without secrets-store load",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Portable deploy template does not embed SECRET_TOKEN_LAUNCHD_XYZ",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts -t 'AC-6'",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Typecheck and lint are clean on write_allowed surfaces",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform/tests/integration/redhat-fix-s27-23-launchd-webhook-secret-hygiene.test.ts",
      "maps_to_ac": "AC-1"
    }
  ],
  "proposed_by": "security-reviewer",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

