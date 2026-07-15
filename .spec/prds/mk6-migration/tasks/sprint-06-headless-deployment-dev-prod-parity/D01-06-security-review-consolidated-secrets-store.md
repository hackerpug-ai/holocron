# D01-06 — Security review: consolidated secrets store

## What this does

Review the consolidated secrets store implementation (D01-04) for confidentiality at rest and in process env, validating that the config-hygiene design correctly implements AP-7 single-user tailnet trust (NOT multi-tenant isolation), and produce a finding log with APPROVED or NEEDS_FIXES.

Provides: Security review attestation for consolidated secrets store (confidentiality, not multi-tenant isolation), Validation that config-hygiene correctly implements AP-7 single-user tailnet trust, Finding log (any issues found or clean bill of health).

## Why

- Review scope is consolidated secrets confidentiality at rest and in process env - NOT multi-tenant isolation (AP-7)
- Review validates config-hygiene design (single-source config) - NOT access control or auth
- If critical issues found, D01-04 must remediate before sprint can close
- MUST review consolidated secrets config at services/platform/config/secrets.yaml (or equivalent)
- MUST validate secrets are gitignored and never committed to repo
- Grounded in: UC-PLAT-05, T-PLAT-017

## How to verify

- `test -f .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log file exists)
- `grep -q 'Verdict: APPROVED\|Verdict: NEEDS_FIXES' .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log has explicit verdict)
- `grep -q 'secrets gitignored\|zero hardcoded secrets\|secure env loading\|config-hygiene scope' .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log documents AC-1 through AC-4 checks)

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md (NEW - finding log)

Prohibited: services/platform/** (MODIFY - review is read-only, findings logged; if CRITICAL issues, D01-04 remediates) · app/** (MODIFY - not this sprint) · holocron-mcp/** (MODIFY - not this sprint)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-06 — Security review: consolidated secrets store
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (60 min)
AGENT:      implementer=security-reviewer | reviewer=security-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: False)
CAPABILITY: N/A
SPRINT:     [Sprint 6 — Headless Deployment and Dev/Prod Parity](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Review the consolidated secrets store implementation (D01-04) for confidentiality at rest and in process env, validating that the config-hygiene design correctly implements AP-7 single-user tailnet trust (NOT multi-tenant isolation), and produce a finding log with APPROVED or NEEDS_FIXES.
Security review completes with finding log documenting what was checked (secrets gitignored, not committed, not hardcoded, secure loading), what was found (all checks pass or issues list), and final verdict (APPROVED or NEEDS_FIXES). If CRITICAL issues found (secrets committed, hardcoded, injection), D01-04 must remediate before sprint can close - this is the security gate for config-hygiene.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST review consolidated secrets config at services/platform/config/secrets.yaml (or equivalent)
- MUST validate secrets are gitignored and never committed to repo
- MUST validate secrets are not hardcoded in source code
- MUST validate secrets are loaded into process env securely (no shell eval injection)
- MUST validate config-hygiene design (single-source config) - NOT multi-tenant isolation (AP-7 scope)
- MUST produce a finding log (clean bill of health or issues list)
- MUST sign off with APPROVED or NEEDS_FIXES
- NEVER review multi-tenant isolation (AP-7 is single-user tailnet trust - NO RLS, NO multi-tenant)
- NEVER review access control beyond config-hygiene (scoped keys are Sprint 05, auth is AP-7 tailnet boundary)
- NEVER approve if secrets are committed to repo (CRITICAL finding)
- NEVER approve if secrets are hardcoded in source (CRITICAL finding)
- NEVER approve if config loading has shell eval injection (CRITICAL finding)
- STRICTLY review scope is confidentiality at rest and in process env - NOT multi-tenant isolation
- STRICTLY AP-7 defines the trust boundary (tailnet ACLs + scoped keys) - this review validates config-hygiene only
- STRICTLY CRITICAL findings (secrets committed, hardcoded, injection) block sprint close
- STRICTLY finding log must be explicit (what was checked, what was found, what needs fixing)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Review validates secrets are gitignored and never committed
- [ ] AC-2 (PRIMARY): Review validates secrets are not hardcoded in source code
- [ ] AC-3 (PRIMARY): Review validates secrets are loaded into process env securely
- [ ] AC-4 (PRIMARY): Review validates config-hygiene design (single-source) NOT multi-tenant isolation
- [ ] AC-5 (PRIMARY): Review produces finding log with APPROVED or NEEDS_FIXES
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Review validates secrets are gitignored and never committed (flow_ref T-PLAT-017)
  GIVEN D01-04 implemented consolidated secrets config
  WHEN  security reviewer audits repo for committed secrets
  THEN  Reviewer confirms services/platform/config/secrets.yaml is .gitignore'd; git log shows zero commits with secrets.yaml; repo contains only schema/example, not real values; finding log documents this check
  TEST_TIER: integration · VERIFICATION_SERVICE: git-audit · TDD_STATE: red

AC-2 [PRIMARY] Review validates secrets are not hardcoded in source code (flow_ref T-PLAT-017)
  GIVEN D01-04 removed Convex env aliases and consolidated config
  WHEN  security reviewer audits source for hardcoded secrets
  THEN  Reviewer confirms grep finds zero hardcoded DATABASE_URL, fleet endpoints, API keys in services/platform/src/; all config reads from consolidated source; finding log documents this check
  TEST_TIER: integration · VERIFICATION_SERVICE: source-audit · TDD_STATE: red

AC-3 [PRIMARY] Review validates secrets are loaded into process env securely (flow_ref T-PLAT-017)
  GIVEN D01-04 config loader reads secrets and makes them available
  WHEN  security reviewer audits config loading code
  THEN  Reviewer confirms config loader uses secure APIs (no shell eval injection, no subprocess with env in command); secrets are loaded via standard env var assignment or secure config library; finding log documents this check
  TEST_TIER: integration · VERIFICATION_SERVICE: code-audit · TDD_STATE: red

AC-4 [PRIMARY] Review validates config-hygiene design (single-source) NOT multi-tenant isolation (flow_ref AP-7)
  GIVEN AP-7 defines single-user tailnet trust (NO RLS, NO multi-tenant)
  WHEN  security reviewer audits config-hygiene scope
  THEN  Reviewer confirms consolidated secrets is config-hygiene (single-source config) - NOT tenant isolation (no RLS, no per-tenant keys); scope matches AP-7 (tailnet ACLs + scoped keys are the trust boundary, not config); finding log documents this scope validation
  TEST_TIER: integration · VERIFICATION_SERVICE: design-audit · TDD_STATE: red

AC-5 [PRIMARY] Review produces finding log with APPROVED or NEEDS_FIXES (flow_ref T-PLAT-017)
  GIVEN All checks completed (AC-1 through AC-4)
  WHEN  security reviewer compiles findings
  THEN  Finding log documents each check (what, how, result); if all checks pass, verdict is APPROVED; if any CRITICAL issues found (secrets committed, hardcoded, injection), verdict is NEEDS_FIXES and D01-04 must remediate; finding log is written to sprint artifacts
  TEST_TIER: integration · VERIFICATION_SERVICE: documentation · TDD_STATE: red

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md (NEW - finding log)
writeProhibited: services/platform/** (MODIFY - review is read-only, findings logged; if CRITICAL issues, D01-04 remediates), app/** (MODIFY - not this sprint), holocron-mcp/** (MODIFY - not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-38 [AP-7 tailnet trust boundary (single-user, NO RLS, NO multi-tenant - this review validates config-hygiene scope)]
2. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:68-76 [UC-PLAT-05 AC-3 (consolidated secrets, zero Convex env)]
3. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-05-mastra-service-and-scoped-key-auth/service-3-scoped-key-middleware-and-fleet-resolution.md:69 [AP-7 reference (NO RLS, NO multi-tenant - tailnet ACLs + scoped keys are the trust boundary)]
4. /Users/justinrich/Projects/brain/docs/security-review/SIMPLIFIED-SECURITY-REVIEW.md:all [Security review process and finding log format]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Finding Log Exists: `test -f .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log file exists)
- Finding Log Has Verdict: `grep -q 'Verdict: APPROVED\|Verdict: NEEDS_FIXES' .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log has explicit verdict)
- Finding Log Documents All Checks: `grep -q 'secrets gitignored\|zero hardcoded secrets\|secure env loading\|config-hygiene scope' .spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md` → Exit 0 (finding log documents AC-1 through AC-4 checks)

--------------------------------------------------------------------------------
REVIEW (security-reviewer)
--------------------------------------------------------------------------------
Must pass: Review scope is config-hygiene ONLY (confidentiality at rest and in process env) - NOT multi-tenant isolation; AP-7 defines the trust boundary (tailnet ACLs + scoped keys) - this review validates config doesn't violate that; CRITICAL findings (secrets committed, hardcoded, injection) block sprint close
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D01-04 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-06",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "d01_04_consolidated_secrets_impl": {
      "description": "D01-04 implementation of consolidated secrets config and loader",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/config/secrets.yaml exists (gitignored)",
        "services/platform/config/secrets.example.yaml exists (committed schema)",
        "Config loader module exists at services/platform/src/config/",
        "holo secrets doctor command implemented",
        "All Convex env aliases removed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN D01-04 implemented consolidated secrets config WHEN security reviewer audits repo for committed secrets THEN Reviewer confirms services/platform/config/secrets.yaml is .gitignore'd; git log shows zero commits with secrets.yaml; repo contains only schema/example, not real values; finding log documents this check",
      "verify": "Review attestation includes 'secrets gitignored: PASS' and 'zero secrets committed: PASS'",
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN D01-04 removed Convex env aliases and consolidated config WHEN security reviewer audits source for hardcoded secrets THEN Reviewer confirms grep finds zero hardcoded DATABASE_URL, fleet endpoints, API keys in services/platform/src/; all config reads from consolidated source; finding log documents this check",
      "verify": "Review attestation includes 'zero hardcoded secrets: PASS' with grep evidence",
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN D01-04 config loader reads secrets and makes them available WHEN security reviewer audits config loading code THEN Reviewer confirms config loader uses secure APIs (no shell eval injection, no subprocess with env in command); secrets are loaded via standard env var assignment or secure config library; finding log documents this check",
      "verify": "Review attestation includes 'secure env loading: PASS' with code audit",
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "AP-7",
      "description": "GIVEN AP-7 defines single-user tailnet trust (NO RLS, NO multi-tenant) WHEN security reviewer audits config-hygiene scope THEN Reviewer confirms consolidated secrets is config-hygiene (single-source config) - NOT tenant isolation (no RLS, no per-tenant keys); scope matches AP-7 (tailnet ACLs + scoped keys are the trust boundary, not config); finding log documents this scope validation",
      "verify": "Review attestation includes 'config-hygiene scope: PASS' and clarifies 'NOT multi-tenant isolation (AP-7)'",
      "maps_to_ac": null
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN All checks completed (AC-1 through AC-4) WHEN security reviewer compiles findings THEN Finding log documents each check (what, how, result); if all checks pass, verdict is APPROVED; if any CRITICAL issues found (secrets committed, hardcoded, injection), verdict is NEEDS_FIXES and D01-04 must remediate; finding log is written to sprint artifacts",
      "verify": "Finding log file exists at .spec/prds/mk6-migration/tasks/sprint-06-*/security-review-D01-06.md with verdict",
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Secrets are gitignored and never committed to repo",
      "maps_to_ac": "AC-1",
      "verify": "Review attestation confirms secrets.gitignore exists and git log shows zero secrets commits"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Secrets are not hardcoded in source code",
      "maps_to_ac": "AC-2",
      "verify": "Review attestation confirms grep finds zero hardcoded secrets in services/platform/src/"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Secrets are loaded into process env securely",
      "maps_to_ac": "AC-3",
      "verify": "Review attestation confirms config loader uses secure APIs (no eval injection)"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Config-hygiene scope is NOT multi-tenant isolation (AP-7)",
      "maps_to_ac": "AC-4",
      "verify": "Review attestation confirms scope is config-hygiene only, clarifies AP-7 single-user tailnet trust"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Finding log exists with APPROVED or NEEDS_FIXES verdict",
      "maps_to_ac": "AC-5",
      "verify": "Finding log file exists at sprint artifacts with documented verdict"
    }
  ]
}
-->
</details>