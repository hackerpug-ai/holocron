# Red-Hat Review Report

**Report Date:** 2026-08-02T01:09:15Z  
**Target:** Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip  
**Exact reviewed tree:** `main` at `2b966c7b60559ec9986cf737ed5322a6146c7960`  
**Review mode:** independent adversarial, SHA-bound, read-only  
**Test-reality lens:** ran in implemented-artifact mode; mutation probes were not run because the requested review is non-mutating and the shared worktree is dirty.

## Verdict

**BLOCK / needs revision.** The landed sprint cannot be approved as a cutover. Its committed human-gate evidence certifies success while explicitly showing five failed pre-cutover gates, and the new-stack write fence changes only the short-lived CLI process plus local `.tmp` files. The required production read-only/rollback boundary is therefore not established.

**Severity counts:** **3 CRITICAL, 5 HIGH**. No Medium/Low findings are listed in this report.

## Scope and landing state

- Reviewed the five landed task contracts: D06-01 through D06-05; their implementations; the committed gate plan, gate results, and gate logs; UC-SYNC-03/04 boundaries; and the exact main-tree landing state.
- The SHA is a local `main` commit and is ahead of `origin/main`; this is an audit fact, not a request to push or merge.
- The shared checkout has pre-existing unrelated dirt and newline-only local edits to two Sprint 29 gate JSON files. All conclusions below were established from `git show`/`git grep` against the SHA, not the worktree.
- No product code, task contract, checkout, merge, or remote state was changed. This report is the sole file written by this review.

## Acceptance-criteria verdict matrix

| Contract | AC verdict | SHA-bound basis |
|---|---|---|
| D06-01 AC-1–2 | PARTIAL | Hono fence code exists, but the fenced-row-count requirement is calculated and deliberately not asserted: `services/platform/tests/integration/sprint29-write-fence-red.test.ts:414-429`. |
| D06-01 AC-3 | FAIL | Unfenced MCP exceptions other than `MIGRATION_READ_ONLY` are recorded as success, contradicting “every call resolves”: `sprint29-write-fence-red.test.ts:445-477`. |
| D06-01 AC-4 | PARTIAL | Direct fenced-tool checks exist, but no deployed MCP proof exists; the human gate only starts a fresh local Hono app: `gate-plan.json:75-80`. |
| D06-01 AC-5–6 | PARTIAL | Contracted Convex tests are landed, but no passing committed execution demonstrates their required live pre/post state. |
| D06-01 AC-7–8 | PARTIAL | In-process job fence exists, but it depends on process-local environment state and has no deployed-worker proof: `services/platform/src/queue/jobs-runner.ts:72-84`. |
| D06-02 AC-1 | FAIL | AC requires all eight real gates and their AND; committed gate step 1 only checks that the report length is eight: `gate-plan.json:11-20`. Its evidence records `failed_count: 5`: `.gate-evidence/20260802T004525Z/step1.log:3-7`. |
| D06-02 AC-2 | PARTIAL | A real typecheck negative control exists, but it does not validate the complete production go/no-go command. |
| D06-02 AC-3–4 | FAIL | The test suite substitutes shell echo gates and expressly states the full CLI run is not required: `services/platform/tests/integration/sprint29-go-no-go.test.ts:122-143,267-279`. |
| D06-03 AC-1 | PARTIAL | Fence timestamp is taken before durable Convex set/confirmation: `services/platform/src/cutover/convex-fence-client.ts:199-237`. |
| D06-03 AC-2 | PARTIAL | Gate evidence does not prove the required mutation/action/httpAction/upload sweep; quiet check calls only two mutations: `convex-fence-client.ts:331-374`. |
| D06-03 AC-3 | FAIL | “Quiet interval” neither drains nor waits for scheduled work; it observes a closed audit window then performs two direct probes: `convex-fence-client.ts:307-401`. |
| D06-03 AC-4 | PARTIAL | Coverage command exists, but the final human gate does not execute or preserve its full coverage result. |
| D06-03 AC-5 | PARTIAL | Baseline ordering is measured against the pre-confirmation arm timestamp, not a confirmed deployment fence. |
| D06-04 AC-1 | PARTIAL | Orchestrator contains non-empty/load safeguards, but final gate step 4 proves only one scalar: `gate-plan.json:47-56`. |
| D06-04 AC-2–4 | PARTIAL | Failure/resume code exists, but committed final evidence is not a rerunnable proof of the required freeze/quiet/export provenance. |
| D06-05 AC-1 | FAIL | `cutover:flip` sets only its own `process.env` and writes local files: `services/platform/src/cutover/soak-fence.ts:58-67,263-323`. |
| D06-05 AC-2 | FAIL | “All 44 tools” uses a newly constructed in-process app and counts read-tool errors as passing transport responses: `soak-fence.ts:554-590`. |
| D06-05 AC-3 | FAIL | Read parity is hard-coded to three tables, not the required full migrated set: `soak-fence.ts:624,671-706`. |
| D06-05 AC-4 | FAIL | Article check is an in-process `app.request`, not a real running Hono endpoint: `soak-fence.ts:769-782`. |
| D06-05 AC-5 | PARTIAL | The only committed human-gate proof injects `HOLO_MIGRATION_READ_ONLY=1` into a fresh local process: `gate-plan.json:75-80`. |
| D06-05 AC-6 | FAIL | Aggregate evidence has `toolsPassed:null` and `toolsTotal:null` while still passing: `.gate-evidence/20260802T004525Z/step5.log:3-11`. |

## CRITICAL findings

### C-01 — The completed human gate falsely certifies a failed pre-cutover go/no-go

**Confidence:** HIGH — confirmed by the Convex/cutover, Mastra/soak, and test-reality reviewers.

The Sprint claims the full harness was green and marks the human test 6/6 pass (`SPRINT.md:16-18,52-58`), but gate-plan step 1 runs only `jq -e ".gates | length == 8" go-no-go-report.json` (`gate-plan.json:11-20`). Its committed result prints `failed_count: 5` and still exits zero (`.gate-evidence/20260802T004525Z/step1.log:1-8`). The test purportedly covering D06-02 also replaces the eight production gates with echo-generated success output and says the full CLI suite is “not required” (`services/platform/tests/integration/sprint29-go-no-go.test.ts:122-143,267-279`).

This is a false pass at the principal cutover prerequisite. Replace the gate with an execution of `bun services/platform/src/cli/holo.ts cutover:go-no-go --json`, require `overall.ok == true`, `failed_count == 0`, and nonzero collected tests for every Vitest lane, then preserve that full report as committed evidence.

### C-02 — `cutover:flip` is not a durable or distributed production write fence

**Confidence:** HIGH — confirmed independently by the Convex/cutover and Mastra/soak reviewers; test-reality evidence confirms the in-process substitute boundary.

The only fence mutation is `process.env[HOLO_MIGRATION_READ_ONLY] = '1'` (`services/platform/src/cutover/soak-fence.ts:58-67,263-269`). The command then writes `flip-report.json` and `soak-state.json` beneath `.tmp` (`soak-fence.ts:302-321`), while all runtime guards consult their own process environment (`soak-fence.ts:53-56,98-101,123-126`; `services/platform/src/queue/jobs-runner.ts:72-84`). No source consumer loads `soak-state.json`.

A one-shot CLI cannot change its parent shell, an already-running Hono/MCP server, or worker processes. The gate’s write proof independently injects the variable into a new local process (`gate-plan.json:75-80`), so it cannot demonstrate flip propagation. This violates D06-05 AC-1 and the rollbackable read-only soak boundary in `08-uc-sync.md:46-58`.

Use a durable, authoritative deployment configuration/control-plane write that every serving process loads or is restarted against; prove the configured target and process generations; and define the reciprocal config repoint to frozen Convex as the rollback action.

### C-03 — The alleged quiet interval neither drains work nor observes the required interval

**Confidence:** MEDIUM — direct source analysis by the Convex/cutover reviewer and corroborating gate/contract analysis by the Mastra/soak reviewer.

`runQuietCheck` defines an audit window, queries it immediately, then performs only two direct mutations (`documents.create`, `subscriptions.add`) after that window (`services/platform/src/cutover/convex-fence-client.ts:307-401`). It does not disable or drain crons, queues, outbox work, or scheduled jobs; it also does not wait through `windowSeconds`. The committed proof itself identifies `oracle: "live_probes"` and reports `auditRejectedWriteCount: 0` (`.gate-evidence/20260802T004525Z/step3.log:8-25`).

Consequently, scheduled or in-flight writes can occur after this check and be omitted from the export. D06-03 AC-3 and D06-04’s freeze→quiet precondition are not satisfied. Implement actual schedule disable/drain, observe the full window after drain, and verify both accepted=0 and rejected>0 from the post-drain interval.

## HIGH findings

### H-01 — The 44-tool and article checks are in-process transport checks that accept broken read tools

**Confidence:** HIGH — all three reviewers converged.

`runVerifyTools` constructs a fresh `createHonoApp()` and calls it in-process (`services/platform/src/cutover/soak-fence.ts:554-565`), rather than the running `/mcp` deployment. For read tools it treats HTTP 200/202 as success even when the MCP result is an application-level error (`soak-fence.ts:584-590`). `runVerifyArticle` repeats the in-process application call (`soak-fence.ts:769-782`).

This does not prove all 44 MCP tools return Postgres-backed results or that the running `/article/` endpoint matches the frozen baseline, as D06-05 and UC-SYNC-03 require. Execute the deployed network endpoints and require a successful, schema-valid Postgres-backed result per read tool; preserve the per-tool results.

### H-02 — Read parity excludes most migrated tables, while its test authors a passing baseline from current state

**Confidence:** HIGH — confirmed by the Mastra/soak and test-reality reviewers.

The production verifier checks only `documents`, `conversations`, and `subscription_sources` (`services/platform/src/cutover/soak-fence.ts:624,671-706`) even though D06-05 AC-3 requires exact migrated-table parity. The soak test then overwrites the ETL baseline with current local database counts immediately before aggregate verification (`services/platform/tests/integration/sprint29-soak-flip.test.ts:461-492`).

Loss or divergence in any other exported table can pass. Generate expected counts immutably from the D06-04 archived export/catalog and compare every mapped target table, with no test-authored replacement report.

### H-03 — Gate-plan oracles are materially weaker than their declared human-test steps

**Confidence:** HIGH — all three reviewers converged.

Steps 2–5 inspect isolated JSON values rather than perform their named actions (`gate-plan.json:23-68`): step 2 accepts any one of `ok`, env value, or timestamp; step 3 omits rejected-write and duration requirements; step 4 omits source non-emptiness, FK, vectors, and report `ok`; and step 5 checks only `overall.ok`. The accepted step-5 evidence has `toolsPassed:null` and `toolsTotal:null` (`.gate-evidence/20260802T004525Z/step5.log:3-11`).

These are gate-provability failures: the individual predicates can pass while their contract outcome is false. Rebuild the plan so every step invokes the documented CLI operation and asserts the complete concrete oracle, including explicit per-tool, read, article, job, and write-fence subresults.

### H-04 — D06-01 treats required failed behavior as successful reachability and omits its side-effect oracle

**Confidence:** MEDIUM — direct evidence from the Convex/cutover reviewer, independently identified by the test-reality reviewer.

For every unfenced MCP mutation tool, any error other than `MIGRATION_READ_ONLY` is marked `ok: true` (`services/platform/tests/integration/sprint29-write-fence-red.test.ts:445-477`), despite AC-3 requiring every call to resolve. For fenced Hono writes, the test calculates before/after row counts but intentionally does not compare them (`:414-429`).

The RED/green coverage can therefore pass with broken MCP write tools or with unobserved side effects. Make non-fence errors failures and assert exact before/after counts for every affected table.

### H-05 — The rollback evidence cannot establish a frozen-final-state boundary

**Confidence:** MEDIUM — direct source analysis by the Convex/cutover reviewer.

The `fence_armed_at` timestamp/audit record is created before `npx convex env set` and before the subsequent confirmation (`services/platform/src/cutover/convex-fence-client.ts:199-237`). Article-baseline ordering therefore proves only that it followed an optimistic timestamp, not that the durable Convex fence had propagated. Separately, no landed control-plane/config operation re-points the data plane to frozen Convex, despite UC-SYNC-04 requiring that rollback capability (`.spec/prds/mk6-migration/08-uc-sync.md:56-62`).

Record the arm time only after deployment confirmation and prove it with a successful cross-process blocked-write observation. Add an executable, auditable config re-point action with a no-accepted-post-export-write precondition.

## Gate evidence and reproducibility

The `gate-results.json` verdict is `pass` with 6/6 steps, but it is not sufficient evidence for a completed cutover. In addition to the contradictory scalar outputs above, the plan refers to local `.tmp/D06-04` and `.tmp/D06-05` inputs rather than creating/validating the evidence in-place. A review must not promote this to a landing approval merely because the logs are committed.

## Independent reviewer summaries

- **Convex/cutover reviewer:** 3 Critical, 5 High; focused on durable Convex fence, quiet/drain sequence, ETL provenance, and test side-effect oracles.
- **Mastra/soak reviewer:** needs revision/block; independently confirmed false go/no-go, non-durable new-stack fence, in-process MCP/Hono verification, and incomplete read parity.
- **Test-quality reviewer (standing seat):** 2 Critical, 2 High; confirmed echo-gate substitution and test-authored E2E artifacts. It parsed all 27 contract scenarios successfully, but found that declarative validity does not prove the landed test/runtime boundary.

## Required remediation before a new review

1. Replace the human-gate plan and evidence with actual CLI executions and complete contract-level assertions.
2. Implement and prove a durable control-plane fence that reaches running app, MCP, and worker processes; include its rollback/repoint counterpart.
3. Implement real cron/queue drain and a measured quiet interval before export.
4. Verify deployed `/mcp` and `/article` endpoints, all 44 concrete tool results, every migrated table’s reconciliation counts, all migrated jobs, and blocked writes on every required surface.
5. Re-run the complete gate against the remediated SHA and request a new independent review. This report does not approve, merge, push, or certify the landing.

## Metadata

- **Reviewers:** Convex/cutover domain reviewer; Mastra/soak domain reviewer; mandatory test-quality reviewer; primary red-hat consolidator.
- **Confidence model:** HIGH = independently corroborated by all applicable lenses; MEDIUM = direct evidence plus partial corroboration.
- **Duration:** approximately 16 minutes.
- **Landing decision:** BLOCK — no self-certification.
