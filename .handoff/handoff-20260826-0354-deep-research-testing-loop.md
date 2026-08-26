# Deep Research Global Round-Cap Fix and Real-Service Testing Loop

**Date:** 2026-08-26T03:54:49Z  
**Project:** `/Users/justinrich/Projects/holocron`  
**Branch:** `main`  
**Implementation baseline:** `c2748875acec8dc0378a2df6645ab27531d9c636` (`fix: enforce deep research global round cap`)  
**Handoff commit:** a docs-only child of the implementation baseline; run `git log -1 --oneline` for the self-referential current ID  
**Status:** implementation and deterministic real-Postgres regression complete locally; origin reconciliation, deployment, live model restoration, and live end-to-end validation remain open  
**Original incident handoff:** `/Users/justinrich/Projects/travel/.handoff/handoff-20260826-0054-holocron-deep-research-runaway.md`

## Verification Legend

- **VERIFIED** — directly observed in this investigation or reproduced by a command in §10.
- **CLAIMED** — reported by another actor or earlier run but not independently reproduced here.
- **ASSUMED** — proposed next-step behavior or inference that still needs validation.
- **UNKNOWN** — evidence is insufficient; do not convert this into a causal claim.

## 1. Current State

- **VERIFIED 2026-08-26T03:54Z:** the implementation baseline was `c2748875` on `main`; the fix changes exactly four files and is committed. The handoff is a subsequent docs-only commit.
- **VERIFIED 2026-08-26T03:55Z:** the focused regression passed against the real local Postgres database `holocron_nonprod`: 1 file, 3 tests, exit 0.
- **VERIFIED 2026-08-26T03:55Z:** `pnpm tsc --noEmit` exited 0.
- **VERIFIED after committing this handoff:** local `main` is **ahead 24 and behind 6** relative to `origin/main`. Do not push, force-push, merge, pull, or rebase this dirty checkout as part of the testing loop.
- **VERIFIED 2026-08-26T03:55Z:** `origin/main` and the clean checkout on `ssh holocron` are both `15ada6f383e810dc6c0a081d8aa8a5f9543292b1`. The fix commit is therefore not deployed.
- **VERIFIED 2026-08-26T03:55Z:** all production containers listed in §9 report healthy, but container health does not prove the local inference dependencies or Langfuse export work.
- **VERIFIED 2026-08-26T03:55Z:** local router port `4545` listens under PID `40409`; ports `8003` and `8004` have no listeners. Their receipt files still say `running` with dead PIDs `67307` and `69853`.
- **VERIFIED 2026-08-26T03:56Z:** the incident's OpenTelemetry batches reached the collector, then the collector dropped them after Langfuse returned HTTP 401 `Unauthenticated`. Durable Mastra spans remain queryable in production Postgres.
- **UNKNOWN:** the exact reason the `8003` and `8004` model processes exited. The logs end after successful requests and contain no orderly shutdown, crash, OOM, or operator-kill proof.
- **VERIFIED 2026-08-26T03:54Z:** the working tree contains extensive unrelated modified, deleted, and untracked work. The four fix files are clean. Preserve all unrelated work; never use `git add -A`, `git clean`, broad stash operations, or destructive reset here.

## 2. Start Here

Start with the deterministic fix, then reconcile the delivery branch, then restore observability and model prerequisites, and only then run the live loop.

### Step A — Reconfirm the fix without touching unrelated work

```bash
cd /Users/justinrich/Projects/holocron
git show --stat --oneline c2748875
pnpm vitest run --project integration services/platform/tests/integration/deep-research-round-cap.test.ts
pnpm tsc --noEmit
git status --short --branch
```

Expected result:

- **VERIFIED at handoff time:** 3/3 focused tests pass and typecheck exits 0.
- **VERIFIED at handoff time:** the current dirty checkout is divergent from `origin/main`; do not deploy it.

### Step B — Reconcile onto current origin in a separate clean worktree

The current-origin branch contains six commits absent from this local `main`, including the wall-time and rerank-degradation fixes. Test the round-cap fix in combination with those commits rather than overwriting them.

```bash
cd /Users/justinrich/Projects/holocron
git fetch --no-tags origin main
git log --left-right --cherry-pick --oneline origin/main...main
git worktree add /Users/justinrich/Projects/holocron-deep-research-round-cap-loop \
  -b test/deep-research-round-cap-loop origin/main
cd /Users/justinrich/Projects/holocron-deep-research-round-cap-loop
git cherry-pick c2748875
```

- **ASSUMED next step:** the cherry-pick will apply cleanly. If it conflicts, resolve only the four fix files against current-origin behavior, rerun every gate, and record the resulting commit. Do not resolve by dropping either the wall-time/rerank changes or the reservation logic.
- **ASSUMED next step:** use the clean worktree for deployment and live-loop artifacts. Do not mutate the dirty primary checkout.

### Step C — Establish real-service prerequisites

Before launching a paid/long-running deep-research session:

1. Run the listener, receipt, process, remote-container, and collector checks in §10.
2. Repair or deliberately restart the `8003` reranker/main and `8004` reviewer through the fleet's canonical service command, after confirming ownership and current configuration. Do not trust receipt JSON alone.
3. Send a real model health/completion or rerank request through the same router path production uses, and retain its response/status as evidence.
4. Send a fresh trace canary and prove both collector receipt and Langfuse acceptance. A healthy container is insufficient; absence from Langfuse is not proof that no work occurred.
5. Deploy only the reconciled commit through the project's normal governed deployment path. Record local commit, pushed commit, deployed repo commit, and running container/image identity separately.

## 3. What Failed

### Incident identity

- **VERIFIED from production Postgres and current MCP reads:** session `01a03b6c-4fca-7a2a-a14a-981b572976eb` is terminal `cancelled`, mode `breadth`, with `current_iteration=3`, `max_iterations=3`, and `elapsedMs=855704`.
- **VERIFIED:** persisted work iterations are `101`, `201`, `301`, `401`, and `901`; terminal cancellation audit iteration `1000` was also persisted.
- **VERIFIED:** the session received its cancel request at `2026-08-26T00:30:04.931153Z`, but the already-running gap round persisted iteration `901` at `2026-08-26T00:31:18.952933Z`.
- **VERIFIED:** work-iteration web calls were grouped under branch IDs `breadth-a`, `breadth-b`, `breadth-c`, `breadth-d`, and `breadth-gap`. The incident rows have `iteration_id=NULL`, so correlate through `session_id`, `branch_id`, and timestamps.

### Root cause

- **VERIFIED from the code path:** `maxRounds` was parsed and forwarded correctly from the MCP schema through the executor and kickoff. The input was not lost.
- **VERIFIED from deployed behavior and code:** breadth decomposition created four subjobs with synthetic round bands `100`, `200`, `300`, and `400`, followed by a gap band `900` when evidence remained incomplete.
- **VERIFIED from the pre-fix code:** each branch enforced only its local loop bound. The branch round number also caused each branch to stop after one local round, but it did not impose one shared global admission budget across branches.
- **VERIFIED from the pre-fix code:** `executeResearchRound` called `recordResearchProgress({advanceIteration:true})` and ignored its failure. Once Postgres reached `current_iteration=3`, later branches still searched, extracted, reranked, persisted iterations, and made web calls while the UI remained at 3/3.
- **VERIFIED:** this explains the apparent contradiction: the progress counter was capped, but execution was not.

### Cancellation and evidence behavior

- **VERIFIED:** cancellation arrived during the in-flight gap round. The gap completed before the post-round cancellation check, then the terminal cancelled record was written.
- **VERIFIED:** the fix prevents a cancelled session from claiming a new round and preserves cancellation precedence when the cap has already been reached.
- **VERIFIED limitation:** the fix does not abort an already-running external search/model call. Do not treat “no new round after cancellation” as proof of immediate in-flight interruption.
- **VERIFIED:** duplicate source/claim material appeared in the incident, but the evidence gate refused publication because the independent-source floor and required components were not satisfied. The gate did not fabricate success.

## 4. The Fix

Commit `c2748875` changes these files:

| File | Behavior |
|---|---|
| `services/platform/src/research/progress.ts` | Adds `reserveResearchSessionIteration()`, a single atomic Postgres `UPDATE ... WHERE current_iteration < max_iterations RETURNING ...` admission gate. Concurrent branches receive one unique slot or `ITERATION_BOUNDS`. |
| `services/platform/src/research/session-writer.ts` | Makes `recordResearchProgress()` return the reservation error code and use the atomic reservation when `advanceIteration` is requested. |
| `services/platform/src/research/workflow/round.ts` | Checks terminal cancellation before reservation; treats `ITERATION_BOUNDS` as `round_cap` unless cancellation is latched; throws on other progress failures instead of silently continuing. |
| `services/platform/tests/integration/deep-research-round-cap.test.ts` | Uses real `holocron_nonprod` Postgres to prove capped branch/gap attempts do no work, two concurrent starters share one remaining slot, and cancellation wins at the boundary. |

Important semantics:

- **VERIFIED:** the budget counts admitted work-round starts, not completed rounds.
- **VERIFIED:** one concurrent branch can reserve the final slot; competitors receive `round_cap` before web work.
- **VERIFIED:** a synthetic terminal/audit iteration such as `1000` is not a work-round admission and may still exist. The live-loop oracle should forbid work iterations/web calls beyond the budget, not blindly forbid every iteration number greater than `maxRounds`.
- **VERIFIED:** the test deliberately uses an already-aborted signal so an admitted final round can finish deterministically without a web request; no model or web dependency is mocked.
- **VERIFIED limitation:** the focused integration proves the shared database boundary. It is not the live production end-to-end proof.

## 5. Real-Service Testing Loop

Run each loop attempt with a unique topic marker and preserve the session ID immediately. Do not reuse an idempotency key or topic marker when you intend to create a fresh run.

### Loop matrix

Run these as distinct sessions after the reconciled fix is deployed and prerequisites are green:

| Case | Input | Required oracle |
|---|---|---|
| Global cap | `mode=breadth`, `maxRounds=3` | At most three admitted work iterations total across all branches; no branch/gap web calls begin after the third reservation. |
| Concurrency | Breadth fan-out with several subquestions and `maxRounds=3` | `current_iteration` never exceeds 3; concurrent branches do not oversubscribe. |
| Cancel before next round | Cancel after at least one persisted iteration, before another reservation | No new work reservation, iteration, or web call begins after the cancellation latch. |
| Cancel during in-flight work | Cancel while a known web/model call is active | No later round begins; explicitly record whether the current in-flight call completes. Immediate abort is not an acceptance criterion for this fix. |
| Evidence refusal | Topic intentionally lacking enough independent sources/components | Terminal result remains partial/refused; the round cap must not turn weak evidence into success. |
| Dependency degradation | Deliberately use the naturally degraded state only if it exists; do not disconnect networking | Failure/degradation is visible in durable DB telemetry, router/model logs, and trace evidence; no synthetic success. |

### Launch through the real Holocron MCP tool

Use the mounted `deep_research` tool with a payload like:

```json
{
  "topic": "[round-cap-loop RUN-UTC-TIMESTAMP] Verify a narrow, source-rich topic with three independent components",
  "mode": "breadth",
  "maxRounds": 3,
  "onBudgetExhausted": "partial"
}
```

- **VERIFIED 2026-08-26T03:58Z:** the mounted MCP schema exposes `deep_research`, `deep_research_result`, `deep_research_control`, and `get_research_session` with the fields used above.
- **ASSUMED next step:** use the same authenticated MCP route the application uses. Do not substitute a direct function call or synthetic queue insert for the live loop.

Poll with `deep_research_result({sessionId, includeFindings:false, waitMs:...})`, but simultaneously query the database. The API progress object is a presentation surface, not proof that background execution stopped.

### Evidence bundle per attempt

Store one immutable directory per run, for example:

```text
.tmp/deep-research-round-cap-loop/<UTC>-<sessionId>/
├── request.json
├── kickoff-result.json
├── poll-snapshots.jsonl
├── session.tsv
├── iterations.tsv
├── web-calls.tsv
├── mastra-spans.tsv
├── collector.log
├── router.log
├── model-8003.log
├── model-8004.log
├── deployed-identity.txt
└── verdict.md
```

- **ASSUMED next step:** redact secret values and authentication headers while retaining correlation IDs, timestamps, HTTP status, provider/model names, and error codes.
- **ASSUMED next step:** use UTC for every saved timestamp. Local model logs currently use MDT, so record the offset when correlating.
- **ASSUMED next step:** never overwrite a failed run. Failures are part of the evidence history.

### Pass criteria

A live case passes only when all applicable items are evidenced:

1. The running deployed revision contains the reconciled round-cap change.
2. The request traveled through the real authenticated MCP/HTTP path.
3. Real production Postgres shows no oversubscription of `current_iteration`.
4. No work iteration or `research_web_calls` activity starts after the global cap or a pre-round cancellation latch.
5. Router and real model services handled the expected requests, or a real degradation is recorded honestly.
6. Mastra durable spans cover the run.
7. The collector received the trace and Langfuse accepted it; if Langfuse rejects it, mark observability failed even if the research behavior itself passed.
8. The evidence gate result matches the available independent evidence.

Keep product correctness and observability health as separate verdicts. A run may prove the cap while failing Langfuse export; report `behavior=PASS, observability=FAIL`, not a blended success.

## 6. Observability Diagnosis Playbook

Use this order. It moves from durable product truth outward to optional presentation systems.

### 6.1 Start from the authoritative session

Query `research_sessions` for status, phase, current/max iteration, cancellation, and lifecycle timestamps. Then query `research_iterations` and `research_web_calls`.

Questions to answer:

- Did a new round reserve a slot after the cap or cancellation?
- Did a row persist without a matching progress increment?
- Did web activity begin after the cap/cancel time?
- Was work in flight before cancellation?
- Does a terminal audit iteration exist separately from work rounds?

Do not infer execution state solely from `deep_research_result.progress.round`.

### 6.2 Find the workflow trace in durable Mastra storage

Use `mastra_ai_spans`, starting with an exact `traceId`, `runId`, or `sessionId` if present. If correlation fields are missing, search a narrow UTC time window for `workflow run: 'research-breadth'`, then verify its children and attributes before linking it to the session.

- **VERIFIED incident limitation:** the incident spans have `runId=72448be4-158d-46d7-b283-47bb19956696` and `traceId=afcfa34ea6401c9346d172a2c5d43dba`, but `sessionId` is null on those rows.
- **ASSUMED next step:** any correlation based only on overlapping time is labeled `time-window inference`, not exact session attribution.

### 6.3 Inspect collector receipt and export separately

The collector's debug exporter proves receipt. The `otlphttp/langfuse` result proves export. Require both.

```bash
ssh holocron '/usr/local/bin/docker logs --since 30m holocron-production-otel-collector-1 2>&1' \
  | rg 'Traces|otlphttp/langfuse|401|Unauthenticated|Dropping data|dropped_items'
```

- **VERIFIED incident evidence:** the collector logged trace batches at `00:15:54Z`, `00:22:50Z`, `00:23:01Z`, `00:26:56Z`, `00:28:26Z`, and `00:31:24Z`, then dropped each Langfuse export with HTTP 401.
- **UNKNOWN current state:** there was no later canary in the inspected window. A fresh canary is required before claiming the auth problem still exists or is repaired.

If 401 persists:

1. Inspect the deployed compose/collector configuration and environment **names only**.
2. Confirm the collector and Langfuse agree on OTLP endpoint and authentication format.
3. Confirm the intended secrets source was loaded into the deployed service without printing values.
4. Restart only the owned collector/Langfuse component if configuration changed.
5. Send a new trace and prove acceptance; a container restart alone is not remediation evidence.

### 6.4 Inspect router and model reality

Check listeners first, then processes, then receipts, then logs. A receipt marked `running` is stale if its PID is absent or its port has no listener.

```bash
for port in 4545 8003 8004; do
  lsof -nP -iTCP:$port -sTCP:LISTEN
done
pgrep -fal 'local-serve|omlx|litellm'
jq '{status,pid,port}' /Users/justinrich/.fleet/.run/laptop/main.json
jq '{status,pid,port}' /Users/justinrich/.fleet/.run/laptop/omlx-research.json
```

Then compare:

- `/Users/justinrich/.fleet/.run/laptop/router.log`
- `/Users/justinrich/.fleet/.run/laptop/main.log`
- `/Users/justinrich/.omlx/logs/omlx-research-8004.log`

- **VERIFIED at handoff time:** router `4545` is live; `8003` and `8004` are not.
- **VERIFIED:** the last `8003` success was a rerank at `2026-08-25T18:18:59-06:00`; the last `8004` success was a chat completion at `2026-08-25T18:22:33-06:00`.
- **UNKNOWN:** why either process exited. Do not write “OOM,” “crash,” or “manual kill” without direct evidence.

### 6.5 Correlate and classify

For every failure, record:

- session ID
- request/control key
- trace ID and run ID
- branch ID and work iteration number
- UTC start/end/cancel times
- provider/model/endpoint name
- HTTP status and stable error code
- whether attribution is exact, field-linked, or only time-window inference

Never equate:

- `progress.round == maxRounds` with background execution stopped;
- missing Langfuse UI data with no trace emitted;
- healthy Docker state with healthy external model dependencies;
- a receipt marked `running` with a live process;
- an evidence-gate refusal with workflow failure;
- a terminal iteration `1000` with a fourth work-round admission.

## 7. Incident Timeline

All times UTC; reproduced from production Postgres.

| Time | Event | Evidence |
|---|---|---|
| `00:15:49.194` | Session created | `research_sessions.created_at` — **VERIFIED** |
| `00:15:49.213` | Breadth workflow span begins | `mastra_ai_spans` — **VERIFIED** |
| `00:15:54.109` | Breadth foreach begins | `mastra_ai_spans` — **VERIFIED** |
| `00:22:45.245` | Branch A persists 101 | `research_iterations` — **VERIFIED** |
| `00:22:56.394` | Branch B persists 201 | `research_iterations` — **VERIFIED** |
| `00:26:51.545` | Branch C persists 301 | `research_iterations` — **VERIFIED** |
| `00:28:21.275` | Branch D persists 401 | `research_iterations` — **VERIFIED** |
| `00:28:21.309` | Gap step begins | `mastra_ai_spans` — **VERIFIED** |
| `00:30:04.931` | Cancellation requested | `research_sessions.cancel_requested_at` — **VERIFIED** |
| `00:31:18.952` | In-flight gap persists 901 | `research_iterations` — **VERIFIED** |
| `00:31:19.039` | Terminal cancelled iteration 1000 | `research_iterations` — **VERIFIED** |
| `00:31:19.061` | Workflow span ends | `mastra_ai_spans` — **VERIFIED** |
| `00:31:24.137` | Collector drops final six spans after Langfuse 401 | collector log — **VERIFIED** |

## 8. Files and Code Anchors

| Purpose | Path / anchor |
|---|---|
| Atomic reservation | `services/platform/src/research/progress.ts:52` |
| Progress writer integration | `services/platform/src/research/session-writer.ts:481` |
| Workflow admission/cancel boundary | `services/platform/src/research/workflow/round.ts:223` |
| Real-Postgres regression | `services/platform/tests/integration/deep-research-round-cap.test.ts:89` |
| Breadth orchestration | `services/platform/src/research/workflow/research-breadth.ts` |
| Kickoff/max-round persistence | `services/platform/src/research/kickoff.ts` |
| MCP schema | `services/platform/src/tools/schemas/research.ts` |
| MCP executor | `services/platform/src/mcp/executor.ts` |
| Stop decision | `services/platform/src/research/workflow/decide-stop.ts` |
| Iteration writer | `services/platform/src/research/iteration-writer.ts` |
| Local router log | `/Users/justinrich/.fleet/.run/laptop/router.log` |
| Local 8003 log | `/Users/justinrich/.fleet/.run/laptop/main.log` |
| Local 8004 log | `/Users/justinrich/.omlx/logs/omlx-research-8004.log` |

## 9. Perishable Runtime Inventory

### Local laptop at 2026-08-26T03:55Z

| Surface | Observed state |
|---|---|
| Holocron local daemon | PID `25070` — **VERIFIED** |
| Scheduler worker | PID `56773` — **VERIFIED** |
| `holo service:up` | PID `60278` — **VERIFIED** |
| MCP access proxy | PID `69503` — **VERIFIED** |
| LiteLLM router `127.0.0.1:4545` | PID `40409`, listening — **VERIFIED** |
| Main/reranker `:8003` | no listener; receipt says PID `67307` running — **VERIFIED stale receipt** |
| Reviewer `:8004` | no listener; receipt says PID `69853` running — **VERIFIED stale receipt** |

### Device at 2026-08-26T03:55Z

- **VERIFIED:** SSH alias `holocron` resolves to user `holocron`, host `holocron.tail011a51.ts.net`, port `22`; hostname reports `holocrons-MBP.lan`.
- **VERIFIED:** noninteractive remote Docker commands require `/usr/local/bin/docker`.
- **VERIFIED:** production containers `edge`, `mastra`, `scheduler`, `postgres`, `zero-cache`, `otel-collector`, all Langfuse dependencies, the router, and registry reported healthy.
- **VERIFIED:** remote deployed repo is clean at `15ada6f383e810dc6c0a081d8aa8a5f9543292b1`.

Re-run this inventory immediately before and after every live attempt. It is not durable state.

## 10. Verification Commands

Run this section before relying on the handoff. Keep raw output in the run evidence directory.

### 10.1 Git and delivery identity

```bash
cd /Users/justinrich/Projects/holocron
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1
git log --oneline -15
git diff --stat
git diff --cached --stat
git stash list
git worktree list
git fetch --no-tags origin main
git status --short --branch
git rev-list --left-right --count origin/main...HEAD
git log --left-right --cherry-pick --oneline origin/main...HEAD
ssh holocron 'cd /Users/holocron/Projects/holocron && git rev-parse HEAD && git status --porcelain=v1'
```

### 10.2 Deterministic focused gates

```bash
cd /Users/justinrich/Projects/holocron
git show --stat --oneline c2748875
pnpm vitest run --project integration services/platform/tests/integration/deep-research-round-cap.test.ts
pnpm tsc --noEmit
```

### 10.3 Local process and listener reality

```bash
for port in 4545 8003 8004; do
  lsof -nP -iTCP:$port -sTCP:LISTEN
done
pgrep -fal 'holocron|mastra|local-serve|omlx|litellm|scheduler'
jq '{status,pid,port}' /Users/justinrich/.fleet/.run/laptop/main.json
jq '{status,pid,port}' /Users/justinrich/.fleet/.run/laptop/omlx-research.json
stat -f '%N | bytes=%z | modified=%Sm' -t '%Y-%m-%dT%H:%M:%S%z' \
  /Users/justinrich/.fleet/.run/laptop/main.log \
  /Users/justinrich/.omlx/logs/omlx-research-8004.log \
  /Users/justinrich/.fleet/.run/laptop/router.log
```

### 10.4 Remote container and collector reality

```bash
ssh holocron "/usr/local/bin/docker ps --format '{{.Names}}\t{{.Status}}'"
ssh holocron '/usr/local/bin/docker logs --since 30m holocron-production-otel-collector-1 2>&1' \
  | rg 'Traces|otlphttp/langfuse|401|Unauthenticated|Dropping data|dropped_items'
```

### 10.5 Production session, iterations, web calls, and spans

```bash
ssh holocron '/usr/local/bin/docker exec -i holocron-production-postgres-1 sh -lc '\''psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off'\''' <<'SQL'
SELECT id, status, phase, current_iteration, max_iterations,
       created_at, started_at, cancel_requested_at, completed_at, updated_at
FROM research_sessions
WHERE id = '01a03b6c-4fca-7a2a-a14a-981b572976eb';

SELECT iteration_number, branch_id, status, duration_ms, created_at, updated_at
FROM research_iterations
WHERE session_id = '01a03b6c-4fca-7a2a-a14a-981b572976eb'
ORDER BY iteration_number;

SELECT COALESCE(iteration_id::text, '<none>') AS iteration_id,
       COALESCE(branch_id, '<none>') AS branch_id,
       count(*) AS web_calls,
       min(created_at) AS first_call,
       max(created_at) AS last_call
FROM research_web_calls
WHERE session_id = '01a03b6c-4fca-7a2a-a14a-981b572976eb'
GROUP BY iteration_id, branch_id
ORDER BY first_call;

SELECT "traceId", "spanId", name, "spanType", "startedAtZ", "endedAtZ",
       "runId", "sessionId", error IS NOT NULL AS has_error
FROM mastra_ai_spans
WHERE "traceId" = 'afcfa34ea6401c9346d172a2c5d43dba'
ORDER BY "startedAtZ";
SQL
```

For a new loop run, replace both the session ID and trace ID. If the trace ID is not yet known, search a narrow UTC window by workflow name and verify correlation before saving it.

### 10.6 Live-loop readbacks

Through the authenticated Holocron MCP integration:

1. `deep_research({topic, mode:'breadth', maxRounds:3, onBudgetExhausted:'partial'})`
2. Save the returned `sessionId` immediately.
3. Poll `deep_research_result({sessionId, includeFindings:false})`.
4. Query the four production tables above while the job runs.
5. For cancellation cases, call `deep_research_control({sessionId, action:'cancel', controlRequestKey:<unique>})` and save the accepted timestamp/readback.
6. After terminal state, call both `deep_research_result` and `get_research_session`, and compare them to Postgres.

## 11. Test and Review Evidence

- **VERIFIED 2026-08-26T03:55Z:** `pnpm vitest run --project integration services/platform/tests/integration/deep-research-round-cap.test.ts` — exit 0; 1 file and 3 tests passed in 5.07 seconds.
- **VERIFIED 2026-08-26T03:55Z:** the test asserted `current_database()='holocron_nonprod'`, used real SQL connections, and cleaned its owned rows.
- **VERIFIED:** no model, web, database, filesystem, or HTTP dependency was replaced with a fake success. The focused cap assertions deliberately stop before web work by using an aborted signal.
- **VERIFIED 2026-08-26T03:55Z:** `pnpm tsc --noEmit` — exit 0.
- **CLAIMED from the implementation session:** commit hooks also passed root lint, root typecheck, and the root unit suite (87 passed / 5 skipped files; 555 passed / 30 skipped tests). Re-run the relevant current-origin gates after cherry-picking; do not use this historical hook result as combined-branch proof.
- **CLAIMED from the implementation session:** an independent Mastra reviewer approved the final change after cancellation precedence was corrected. Live-provider verification remained blocked because ports `8003` and `8004` were down.

## 12. Open Risks and Unknowns

1. **VERIFIED blocker:** the fix is not on `origin/main` or the device. Local and origin histories diverged; deployment from the current dirty `main` is unsafe.
2. **VERIFIED blocker:** `8003` and `8004` are down while their receipts claim running. A real live research run will be degraded or fail until process reality is reconciled.
3. **VERIFIED observability failure for the incident:** collector-to-Langfuse export returned 401 and dropped spans.
4. **UNKNOWN current Langfuse health:** no fresh canary was sent after the incident. Reproduce before fixing or declaring repaired.
5. **UNKNOWN model exit cause:** no direct crash/OOM/operator evidence was found.
6. **VERIFIED limitation:** cancellation is cooperative at round boundaries; in-flight external work may complete.
7. **VERIFIED data-model limitation:** incident web-call rows lack `iteration_id`; use branch/timestamp correlation.
8. **VERIFIED tracing limitation:** incident Mastra span rows lack `sessionId`; exact trace attribution came from prior investigation plus the workflow timeline. Improve correlation separately; do not fold an observability redesign into the bounded round-cap fix without explicit scope.
9. **ASSUMED risk:** cherry-picking the fix atop origin-only wall-time and rerank changes may expose conflicts or behavioral interactions. The real-Postgres regression and live loop must be rerun on the reconciled commit.
10. **ASSUMED cost risk:** repeated live breadth sessions can consume web/provider capacity. Use narrow, unique cases and stop when the required evidence is collected; do not weaken the real-service requirement with mocks.

## 13. Delivery State

- **VERIFIED:** implementation commit: `c2748875acec8dc0378a2df6645ab27531d9c636`.
- **VERIFIED:** local working branch: `main`, with unrelated dirty work and 24/6 divergence from `origin/main` after this docs-only handoff commit.
- **VERIFIED:** remote/deployed baseline: `15ada6f383e810dc6c0a081d8aa8a5f9543292b1`.
- **VERIFIED:** no push or deployment of the round-cap fix occurred in this investigation.
- **ASSUMED next step:** reconcile/cherry-pick in a clean worktree, revalidate, commit the resolution if needed, then use the normal governed push/deploy process.
- **ASSUMED next step:** record source-landed, pushed, deployed, running, behavior-verified, and observability-verified as separate states.

## 14. First Decision for the Next Session

Choose whether the immediate objective is:

1. **Delivery preparation:** reconcile `c2748875` onto current `origin/main`, run the focused and full required gates, and produce a deployable commit; or
2. **Environment repair:** restore `8003`/`8004` and Langfuse export first, prove both with live canaries, then reconcile/deploy; or
3. **Local loop harness only:** build the evidence-capture loop against the local real Postgres without claiming production E2E completion.

The recommended order encoded by this handoff is delivery reconciliation → model/observability canaries → governed deployment → live MCP testing loop. This is a proposed sequence, not a verified completed state.
