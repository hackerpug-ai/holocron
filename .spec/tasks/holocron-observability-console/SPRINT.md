# Sprint: Holocron Observability Console

**Status:** In Progress
> Progress: 3/8 tasks completed · updated 2026-08-27T20:45:00Z
>   Landed: OBS-01 (baseline/canary), OBS-02 (OTLP v4 pipeline), OBS-04 (topology +
>   backup/restore). Remediation branch `task/obs-remediation-mt88s12y` (goal
>   `mt88s12y-1645ni`) closes the gaps found in each: dead OTLP leg wiring, false
>   LANGFUSE_UNREACHABLE, span shape (B1–B5), export health (C1–C3), and backup
>   coverage for Langfuse state (D1). OBS-03/OBS-05/OBS-MCP-*/OBS-QA-01 remain.

## Remediation audit reconciliation (goal `mt88s12y-1645ni`, 2026-08-27)

Independent post-deploy audit (device datastores + live deploy) confirmed the
remediation end state and surfaced three findings; reconciliation below is
binding context for OBS-03/OBS-05/OBS-QA-01:

1. **A5 queue bound contract moved (reconciled in tests).** The shipped
   collector build rejects `ttl` under the `file_storage` extension
   ("invalid keys: ttl" → config load fails → otel-collector crash loop, the
   production deploy failure fixed in 36d9b32f). The on-disk queue is bounded
   by `sending_queue.queue_size` (1000) instead; the phase-a test now pins the
   queue-size bound AND asserts the `ttl` key stays absent (regression guard
   against the crash loop).
2. **Chat-path span correlation contract.** Spans emitted by the Mastra OTel
   integration carry SDK-generated trace ids, not `chatRunTraceId(runId)`.
   B1's tested contract is the `chat_runs.trace_id` DB stamp (valid W3C 32-hex,
   idempotent per run — replacing the malformed `chat:${runId}` stamp); live
   chat-span correlation is via the runId embedded in span names
   (e.g. `model_chunk chat-knowledge-89d206eb`). The deterministic
   trace-id linkage is realized on the mission/platform-exporter path
   (`bufferMissionRootSpan`), which also carries the B2 session/release and
   B5 usage attributes. Live post-deploy exercise drove a chat run, not a
   mission run — running one mission and verifying its root span arrives in
   Langfuse under `chatRunTraceId`-shaped linkage is follow-up work owned by
   OBS-03.
3. **Upstream exporter span-drop disclosure.** `@mastra/otel-exporter` drops
   one span per chat turn with `completionStartTime.toISOString is not a
   function` (device mastra logs, 2026-08-27T20:11:13Z). Consequence:
   `usage_details` is `{}` on arrived model spans from that path; the 5-span
   agent chain still arrives (verified in Langfuse). Token/cost usage proof
   rides the platform-exporter mission path (`bufferMissionModelCall`);
   re-pin or patch the exporter when upstream fixes the serialization bug.
**PRD:** `.spec/prd/holocron-observability-console/README.md`
**Execution mode:** task worktrees, implementer commit, independent review, orchestrator-only merge

## Objective

Deliver the private Langfuse console, first-party event read model, scoped MCP query,
and exact-release real-service evidence defined by the PRD. This sprint is not complete
until OBS-QA-01 proves the hosted system at one immutable release identity.

## Dependency graph

```text
OBS-01
  |-- OBS-02 --\
  |             --> OBS-03 --> OBS-MCP-01 --\
  `-- OBS-04 --> OBS-05 ---------------------> OBS-MCP-02 --> OBS-QA-01
```

| Task | Owner | Result | Depends on |
|---|---|---|---|
| OBS-01 | `mastra-planner` + `mastra-implementer` | accepted dependency/image matrix, real canary, capacity and overlap go/no-go | — |
| OBS-02 | `mastra-implementer` | official Mastra/Langfuse OTLP v4 pipeline with real failure semantics | OBS-01 |
| OBS-03 | `mastra-implementer` | durable signals, observed queue, health, retention, alerts | OBS-02, OBS-04 |
| OBS-04 | `mastra-implementer` + deployment specialist | twelve-service immutable release, secret, backup/restore contract | OBS-01 |
| OBS-05 | deployment specialist | pinned edge and custom web image serving `/observability` | OBS-04 |
| OBS-MCP-01 | `mcp-implementer` | indexed service-event view, bounded query, dedicated auth scope | OBS-03 |
| OBS-MCP-02 | `mcp-implementer` | manifest v1.1.0, exact 45 tools, HTTP/stdio/delegate parity | OBS-MCP-01, OBS-05 |
| OBS-QA-01 | independent reviewer + operator | fresh hosted mission, outage, restart, backup, restore, browser, MCP proof | all prior |

## Dispatch and ownership gates

Before every dispatch:

1. Record `git rev-parse main`, `git status --short --branch`, current worktrees, and
   `.kb-run-sprint` status using project tooling.
2. Reconcile write-allowed paths against every retained Sprint 33 worktree. One writer
   owns a shared path at a time; never reset, stash, clean, prune, or overwrite WIP.
   This plan reserves migrations 0042 and 0043 because active task plans already name
   0039–0041; confirm that journal order immediately before OBS-03 dispatch. A collision
   requires a planning amendment, not worker improvisation.
3. Give the worker exactly one task file and its listed write surface. Workers commit
   to their branch and stop; they never merge, push main, delete a branch, or remove a
   worktree.
4. Assert main is unchanged after the worker. Route the commit through the named
   specialist reviewer and real verification before the orchestrator merges.
5. Land in dependency order. OBS-02 and OBS-04 may run in parallel only after OBS-01;
   OBS-03 waits for both accepted predecessors.

## Sprint-wide prohibitions

- No fake HTTP sink, mocked database, in-memory filesystem, canned trace, synthetic
  auth success, skipped live path, placeholder credential, floating tag, or TODO in
  place of required behavior.
- No public ingress or network-disruption testing. Simulate a sink outage by stopping
  only the scoped Langfuse service through the release lifecycle, never by changing
  Wi-Fi, interfaces, DNS, firewall, or tailnet settings.
- No secret values in Git, logs, argv, evidence, task artifacts, or release metadata.
- No private Langfuse table queries, Docker-log scraping, or raw prompt/response fields
  in `service_event_feed_v1`.
- No done claim based only on source, unit tests, container start, archive creation, or
  parse-only registrar output.

## Shared quality gates

Every implementation task runs:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
git diff --check
```

Task-specific real-service commands are blocking in each charter. Missing credentials
or services produce a `BLOCKED` receipt naming the absent invariant; they may not turn a
required test into a skip. Before commit, scan touched production and test code:

```bash
rg -n 'TODO|FIXME|placeholder|fake success|it\.skip|describe\.skip|test\.skip|mock|stub' \
  services/platform holocron-mcp scripts
```

Review each hit in context. Historical or non-core uses require an explicit allowlist;
new required behavior cannot remain behind one.

## Landing and release gates

- Each task has a descriptive conventional commit and passes all hooks without bypass.
- Each merge records implementation SHA, reviewer SHA/receipt, required command output,
  and named real-service artifact paths.
- ReleaseLock v2, Compose hash, every image digest/source revision, database migration
  head, and hosted `/health` identity must agree before rollout.
- No client/mobile directories are in scope, so this sprint does not trigger EAS/App
  Store deployment. The platform release still requires its own immutable deploy gate.
- OBS-QA-01 owns final rollout acceptance. A failed outage, restart, backup, restore,
  browser, or MCP parity gate leaves the initiative incomplete even when prior tasks
  landed.

## Completion ledger

| Task | Planned evidence root | Terminal rule |
|---|---|---|
| OBS-01 | `.tmp/OBS-01/` | accepted candidate and capacity go, or BLOCKED |
| OBS-02 | `.tmp/OBS-02/` | real OTLP v4 success/failure/recovery |
| OBS-03 | `.tmp/OBS-03/` | real Postgres signals and health state machine |
| OBS-04 | `.tmp/OBS-04/` | exact topology plus real backup/isolated restore |
| OBS-05 | `.tmp/OBS-05/` | exact ingress parity and real browser proof |
| OBS-MCP-01 | `.tmp/OBS-MCP-01/` | SQL/query/auth/redaction/index receipts |
| OBS-MCP-02 | `.tmp/OBS-MCP-02/` | manifest/HTTP/stdio/delegate parity receipts |
| OBS-QA-01 | `.tmp/OBS-QA-01/` | one signed exact-release evidence index |
