# REDHAT-FIX-H2 — Non-skippable budgeted-escape telemetry and ledger proof

> Remediation task for HIGH finding H-2 from the independent Sprint 12 review. Planning-only: the assigned implementer must execute the real escape path and an independent reviewer must verify the evidence before close.

## Provenance

- **Finding:** `.tmp/sprint-12-independent-readonly-review-20260718T041606Z.md`, H-2, reviewed 2026-07-18T04:16:06Z.
- **Baseline:** main `1e9c614`; review found `.tmp/obs-2/AC-3-key-presence.json` recorded `hasAnthropicKey: false` and the required AC-3 was skipped.
- **Authoritative feature task:** `obs-2-inference-telemetry-stream-tokens-wall-ms-endpoint-role-postgres-per-call.md`, especially the budgeted-escape/ledger correlation criteria; obs-5’s real-ledger requirement is also binding.
- **Scope guard:** Do not reopen obs-2 as an incomplete feature; this is a red-hat remediation of missing proof. Do not edit ROADMAP.md or gate-results during planning.

## Task metadata

```yaml
TASK: REDHAT-FIX-H2
TASK_TYPE: FEATURE
STATUS: Backlog
PRIORITY: P0
EFFORT: S (120 min)
AGENT: implementer=mastra-evals-implementer | reviewer=mastra-reviewer
PROPOSED-BY: independent Sprint 12 review
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes
REAL_SERVICE_REQUIRED: yes
SEEDED_EVIDENCE_REQUIRED: yes
SPRINT: Sprint 12 — Observability, Telemetry and Eval Gate
```

## Objective and outcome

Make the declared budgeted Anthropic escape path a mandatory, observable, real-service gate. When the required credential/service is unavailable, the gate must fail closed or explicitly block; it must never silently skip. When available, execute one real budgeted escape and retain evidence linking the inference telemetry row to the Postgres `budget_ledger` row through stable `run_id`, `step_id`, and/or `budget_ledger_id` identity.

The resulting evidence must include raw CLI/test stdout and stderr, direct process exit status, service-side Postgres query output, environment/dependency provenance without secrets, and a hash manifest bound to the implementation tip.

## Scope

### In scope

- Make the required AC-3 escape test non-skippable under the Sprint 12 gate; a missing Anthropic key or unavailable dependency must produce a deterministic failed/blocked result, not a pass or skip.
- Provision/use the approved real Anthropic credential in the QA environment without committing or printing its value.
- Execute the real budgeted escape through the public mission/inference path and retain the corresponding `inference_telemetry` and `budget_ledger` query artifacts.
- Strengthen the integration assertion to require a concrete ledger/telemetry correlation and nonzero/zero statuses appropriate to the actual budgeted escape outcome.
- Retain raw evidence under `.tmp/redhat-fix-h2-red/` and `.tmp/redhat-fix-h2-green/`, including direct `$?`, command lines, timestamps, service health, query results, and SHA-256 manifests.

### Non-goals

- Do not fake an Anthropic response, mock Postgres, seed a fabricated telemetry row, or replace a real escape with a default-fleet call.
- Do not make the requirement optional merely because a local developer lacks a credential; use explicit fail-closed dependency reporting.
- Do not weaken existing default-fleet telemetry, budget limits, privacy redaction, or idempotency behavior.
- Do not alter ROADMAP.md, gate-results.json, existing closure metadata, or unrelated observability/eval tasks.

## Dependencies and constraints

- Real Postgres and the approved Anthropic service/key must be available to `PLATFORM_IT=1`; record availability and redacted configuration identity.
- Use the repository’s existing budget-ledger and telemetry schemas/migrations. Do not invent a parallel ledger.
- The public integration/mission entrypoint must be exercised; internal inserts alone are insufficient.
- Secrets must remain in environment/secret storage and must not appear in stdout, stderr, query artifacts, commits, or review output.
- All evidence must be generated after implementation and tied to a reachable commit; mutable worktree artifacts alone cannot satisfy closure.

## RED-first evidence

1. Add or enable the mandatory AC-3 assertion before implementation and run it with the required dependency absent. The result must fail closed with an explicit missing-dependency reason, never report a skip/pass.
2. Save the failing test output and dependency/provenance record under `.tmp/redhat-fix-h2-red/`, with direct process status and no secret values.
3. Implement the smallest production/test-gate changes required to run the real escape and correlate rows.
4. After GREEN, retain `.tmp/redhat-fix-h2-green/stdout.txt`, `stderr.txt`, command record, telemetry query output, ledger query output, correlation excerpt, and SHA-256 manifest.

## Exact implementation and evidence surfaces

- `services/platform/tests/integration/inference-telemetry.test.ts` — remove silent AC-3 skip and assert explicit fail-closed or real escape correlation.
- Existing budget-ledger/telemetry production modules and migrations — only where the real correlation is absent; preserve schema and security contracts.
- `.tmp/redhat-fix-h2-red/**` and `.tmp/redhat-fix-h2-green/**` — raw evidence, query artifacts, redacted environment metadata, and hashes.
- Any touched source/test file must be listed in the final handoff; do not modify SPRINT.md, ROADMAP.md, gate results, or unrelated feature tasks.

## Acceptance criteria

### AC-1 — Missing dependency fails closed

Given the required escape dependency is unavailable, the Sprint 12 gate exits nonzero or emits an explicit blocked verdict with a machine-readable missing-dependency reason. The test is not skipped and cannot silently pass.

### AC-2 — Real budgeted escape is executed when provisioned

Given the approved key/service is available, the public mission/inference path performs a real budgeted escape, returns the expected budget/escape outcome, and records no secret material.

### AC-3 — Telemetry correlates to the real ledger

The retained Postgres evidence shows the same stable identity (`run_id`, `step_id`, and/or `budget_ledger_id`) joining the `inference_telemetry` row to the `budget_ledger` row, with model/provider, token/wall-time fields, budget outcome, and timestamps present.

### AC-4 — Raw evidence is complete and hash-bound

Raw stdout/stderr, direct process status, service health, query results, exact redacted commands, and environment provenance are retained; every evidence file is SHA-256 listed and the manifest is bound to the reviewed implementation commit.

### AC-5 — Existing telemetry behavior remains green

Default-fleet telemetry, privacy/redaction, budget enforcement, and existing integration tests remain passing without skips that hide required behavior.

## Test criteria

- **TC-1:** Run the mandatory AC-3 test with the key absent; assert nonzero/blocked and explicit missing-dependency output, not skipped.
- **TC-2:** Run the real provisioned escape against real Postgres and the real Anthropic service; assert raw process status and service-side rows.
- **TC-3:** Query `inference_telemetry` and `budget_ledger`; verify stable identity correlation and required fields.
- **TC-4:** Verify no secret patterns occur in retained artifacts and all hashes match the manifest.
- **TC-5:** Run the full relevant integration file and typecheck/lint; record direct exits and skip counts.
- **TC-6:** Verify the evidence commit is an ancestor of the reviewed tip and no gate/ROADMAP/closure metadata was modified by this task.

## Verification commands

```sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inference-telemetry.test.ts
pnpm tsgo --noEmit
pnpm biome check services/platform/tests/integration/inference-telemetry.test.ts services/platform/src/inference
# Use the repository's approved real-service command and DATABASE_URL; record it redacted.
# Query the real Postgres tables by the emitted run_id/step_id/budget_ledger_id.
# Capture direct $? and preserve stdout/stderr, then sha256sum every evidence file.
```

## Done / close criteria

- [ ] RED artifact proves missing dependency is a visible fail-closed/blocked result, not a skip.
- [ ] Provisioned GREEN run executes the real budgeted escape.
- [ ] Real `inference_telemetry` and `budget_ledger` rows correlate by stable identity.
- [ ] Raw CLI/test/service/query evidence and SHA-256 manifest are retained without secrets.
- [ ] Full relevant tests pass with no hidden required-path skip; typecheck/lint pass.
- [ ] Implementer and reviewer commits are reachable; evidence is hash-bound to the reviewed implementation tip.
- [ ] Fresh independent review is requested; parent controller alone decides Sprint close.

## Closure evidence checklist

- RED missing-dependency log and machine-readable blocked result.
- GREEN raw stdout/stderr, direct exit record, service health, and redacted command/environment record.
- Postgres `inference_telemetry` and `budget_ledger` query artifacts plus correlation excerpt.
- Hash manifest, test/typecheck/lint logs, and ancestry proof.
