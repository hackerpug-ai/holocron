# Red-Hat Review Report — Holocron MK-VI Code and Deployment

**Report Date**: 2026-08-15T23:21:22Z<br>
**Target**: `.spec/prds/mk6-migration/`, repository implementation, and the tailnet deployment on `holocron`<br>
**HEAD Reviewed**: `322a094e5281185be0f90edc1df951fe26ef7043`<br>
**Last Observed Deployment**: source `e116f828ea52223eb3bf050a6093fb40832f8a2a`, image `sha256:e30a02252436cad92fe28dcb91d1e284bec7b790c3f83e8e2a9173c7352b0f1b`, generation `holocron-137d126eb98c88f89e0186e6`<br>
**Review Lenses**: migration/cutover, Mastra/backend, MCP, React Native/Zero, test reality, and root live operations<br>
**Fanout**: four specialist agents across five review lenses; the test-quality standing seat reused a completed reviewer thread because the runtime limited the root to three concurrent child threads<br>
**Test-reality lens**: ran in IMPLEMENTED mode. Mutation writes were not performed during this review-only pass; the standing seat independently reproduced false-green gates and audited real-service oracles.<br>
**Verdict**: **BLOCK — Holocron is not currently healthy, the migration is not deletion-ready, and several production surfaces report success without delivering their advertised behavior.**

---

## Executive Summary

Holocron was not running well at the end of this audit. Earlier in the window, the private health endpoint returned HTTP 503 because the deployed Mastra container could not reach its configured fleet endpoint. At 2026-08-15T23:16:05Z, `holocron` was offline in Tailscale, two pings received no reply, and HTTPS health timed out with HTTP 000. Direct SSH authentication to the device was unavailable, so container, disk, and host logs could not be inspected after it went offline.

The outage sits on top of deeper correctness failures:

- The deployed release is 11 commits behind the reviewed source and rewrites a loopback fleet URL to `host.docker.internal`, although the working fleet lives on the laptop's tailnet endpoint.
- The deployed control plane still reports `data_plane=convex`, `target=convex-frozen`. Before the device went offline, authenticated `/api/content-probe` returned 410 and five authenticated Postgres-backed MCP list tools returned empty collections.
- The scheduler starts a new PgBoss instance every 30 seconds and overwrites the only retained handle without stopping the previous instance. Live evidence on `inference1` showed this failure mode had reached approximately 90 idle `holocron-pg-boss` sessions and `too many clients` errors before the scheduler restarted.
- All six backup heartbeats on `inference1` are overdue by roughly 4,700 minutes. Base-backup and WAL launch agents exit `EX_CONFIG` because their installed command paths point at a deleted sprint worktree. The alert sweep exits 1 and cannot deliver alerts because its webhook is absent.
- The D08-03 deletion gate is false-green: its retained JSON references 12 evidence files, all 12 are absent, yet `assert-s32-d08-03-deletion-gate.sh` exits 0.
- The latest D08-09 artifact records a valid historical two-device drill on 2026-08-14, but it is not current deployment proof. Its task markdown still records the older failed attempt, creating conflicting status authorities.
- Production code contains explicit and semantic stubs: `GET /api/missions` always returns 501; `check_subscriptions` only counts sources and hardcodes zero fetched/queued; the central Mastra registry has no agents or workflows; client loading/error/retry state is hardcoded to healthy-empty/no-op; and missing client configuration silently falls back to loopback plus an E2E user.
- Static tool-count, schema, fixture, and source-residue checks can all pass while these failures remain. The full `verify:no-convex` gate also failed during this audit because the iOS build uses shared Xcode state and collided on `build.db`.

The one safe conclusion is that Convex cloud deletion must remain closed. Recovery must establish one authoritative host, one Postgres data plane with a non-empty verified corpus, bounded queue connections, fresh backups and a real restore, then rerun the deployment and two-device gates against the exact promoted release.

---

## Scope and Safety Boundary

The audit was read-only with respect to production and product code. It did not restart services, stop Postgres, alter Tailscale, modify credentials, run the irreversible D08-05 action, or disturb the competing Xcode build. The worktree was clean at preflight.

The following were exercised against real surfaces:

- Tailscale status, ping, and private HTTPS health from the operator laptop.
- Authenticated read-only HTTP/MCP calls before `holocron` went offline.
- Real LiteLLM model-list and completion probes against the healthy local fleet.
- Read-only SSH diagnostics on `inference1`, including live LaunchAgent state, backup status, logs, filesystem paths, and Postgres activity.
- Repository-native static and composite decommission gates.
- Direct reproduction of the D08-03 false-green assertion with all referenced evidence absent.

The following remain unobservable because `holocron` is offline and SSH authentication failed:

- Current container state, host disk pressure, restart reason, and service logs on `holocron`.
- Current production Postgres row counts and queue state.
- A current authenticated mission lifecycle, scheduler side effect, MCP mutation, or Zero client sync.
- A fresh D08-09 disruption drill; it requires an authorized operator window.

---

## Deterministic Gate Pre-Check

| Gate property | Verdict | Evidence |
|---|---|---|
| Worktree safety | PASS | Initial `git status --short` was empty on `main` at `322a094e`. |
| Runtime freshness | FAIL | Observed deployment source `e116f828` is an ancestor 11 commits behind reviewed HEAD. Reviewed HEAD is also four commits ahead of `origin/main`. |
| Human-gate executability | FAIL | Bare `holo` is absent locally; the installed `holo` on `inference1` reports `unknown command: backup:status`; `verify:decommission-inventory` exits 1 because `convex/` is gone; full `verify:no-convex` exits 1 on a shared Xcode `build.db` lock. |
| Oracle provability | FAIL | D08-03 accepts missing evidence, D08-09 accepts historical JSON without freshness/identity enforcement, and MCP verifiers prove registration/fixture shape rather than behavior. |
| Non-empty data | FAIL | Authenticated deployed MCP reads returned zero documents, subscriptions, improvements, tools, and What's New reports; `/api/content-probe` returned 410 on the Convex plane. |
| Current deployment evidence | FAIL | Historical D08-09 passed on 2026-08-14; current health later degraded to 503 and then became unreachable/offline. |
| Irreversible decommission authority | FAIL | D08-05 has not been executed or authorized, D08-03 evidence is unverifiable, the data plane is still Convex, and the current host is offline. |

---

## HIGH-Confidence Findings

These findings have direct live or source evidence and agreement across at least three review lenses, or were independently reproduced by the root and standing test-quality seat.

### RH-P0-01 — Production is unavailable and fleet routing is wrong

**Severity**: CRITICAL<br>
**Status**: open

- Earlier `/health` calls returned 503 with `fleet.ready=false`, while Postgres, queue, Zero Cache, and deployment identity were ready.
- The configured endpoint was `http://host.docker.internal:4545`; the real fleet was healthy at the laptop tailnet endpoint and completed real requests.
- At 2026-08-15T23:16:05Z, Tailscale reported `holocron` offline, pings timed out, and HTTPS returned HTTP 000.
- [`production-deploy.ts`](../../services/platform/src/deploy/production-deploy.ts) lines 447–461 rewrite loopback to `host.docker.internal` without proving that the Docker host runs the fleet.

**Required oracle**: from inside both Mastra and scheduler containers, authenticated `/v1/models` and a real completion succeed against the configured fleet; three consecutive private `/health` calls return 200 with the exact image, source, generation, Postgres plane, and all required services ready.

### RH-P0-02 — Scheduler heartbeat leaks PgBoss connection pools

**Severity**: CRITICAL<br>
**Status**: open

- [`scheduler-worker.ts`](../../services/platform/src/queue/scheduler-worker.ts) lines 261–268 calls `startQueueBackend()` every 30 seconds.
- [`backend.ts`](../../services/platform/src/queue/backend.ts) lines 45–56 creates and starts a new PgBoss and overwrites `pgBossInstance`. Lines 160–180 can stop only the most recently retained instance.
- No test spans a heartbeat interval or asserts a connection ceiling.
- Live `inference1` logs reported `too many clients`; an earlier query observed roughly 90 idle `holocron-pg-boss` sessions. The scheduler subsequently restarted; a later snapshot had 12 idle sessions, consistent with a reset rather than a fixed lifecycle.

**Required oracle**: a real scheduler runs for at least three heartbeat intervals against isolated Postgres, keeps PgBoss connection count within a fixed ceiling, completes a queued job, and shuts down with zero leaked sessions.

### RH-P0-03 — Backup and alerting are not operational

**Severity**: CRITICAL<br>
**Status**: open

- Live `backup:status --json` on `inference1` returned `ok=false`; all six heartbeats were overdue by 4,699–4,747 minutes.
- Base backup and WAL archive LaunchAgents exit 78 (`EX_CONFIG`). Their installed `ProgramArguments` point at `.kb-run-sprint/worktrees/D04-03/.../holo.ts`, which no longer exists.
- The alert sweep exits 1. Logs report an absent `ALERT_WEBHOOK_URL` while overdue/failed jobs require alerting.
- R2 object counts were unavailable, and no current restore proof exists.

**Required oracle**: stable-path installed units perform real base, WAL, cleanup, and blob-mirror jobs; every heartbeat is fresh; a real alert receipt is recorded; and an isolated restore passes row, FK, ledger, and blob parity.

### RH-P0-04 — The singular Postgres data plane has not been established

**Severity**: CRITICAL<br>
**Status**: open

- Deployed health reported `data_plane=convex`, `target=convex-frozen`.
- Authenticated `/api/content-probe` returned 410 because the observed plane was Convex.
- `get_document` can translate the retired Convex-plane result to ordinary `null`, while `list_documents` directly queries Postgres, creating contradictory read semantics in one MCP surface.
- Five deployed list tools succeeded with zero rows. Empty reads cannot distinguish a correct empty corpus from a wrong database, missing ETL, or no-op behavior.
- S31-CX-02 live export fidelity remains deferred; D08-05 has no deletion receipt.

**Required oracle**: current deployed health reports Postgres; a seeded identity is non-empty and agrees across `/api/content-probe`, MCP `get_document`, MCP `list_documents`, Zero, and direct Postgres; a retired-plane negative control fails closed.

### RH-P0-05 — D08-03 deletion eligibility is false-green

**Severity**: CRITICAL<br>
**Status**: open

- The retained deletion-gate JSON reports `status=pass`, `deletion_eligible=true`, and 12 manifest entries under `.tmp/REDHAT-FIX-S32-D08-03/...`.
- All 12 referenced files are absent.
- [`assert-s32-d08-03-deletion-gate.sh`](../../scripts/assert-s32-d08-03-deletion-gate.sh) lines 108–120 recomputes a digest only when the file exists; absence is not an error.
- The exact assertion command exited 0 during this audit.

**Required oracle**: every manifest target must exist in retained immutable storage and rehash exactly; deleting or changing one byte in any target must make the gate exit non-zero. A new real restore must replace the unverifiable artifact.

### RH-P0-06 — Decommission evidence is historical and internally inconsistent

**Severity**: HIGH<br>
**Status**: open

- `cross-tailnet-drill.json` contains credible 2026-08-14 evidence: two devices, four healthy services, Postgres 503/recovery 200, 44 tools, restart, sentinels, three negative controls, no Funnel, and zero credential values.
- Its manifest explicitly says it was assembled from historical captures.
- The D08-09 task file still records the earlier blocked attempt with zeros and unchecked FAIL states.
- The runbook's deletion predicate checks only a subset of the full drill contract and does not require `status=pass`, timestamps/freshness, restart, sentinels, negative-control counts, or exact deployment identity.
- Current deployment evidence is offline, so the historical artifact cannot authorize a present-tense deletion.

**Required oracle**: one canonical task status generated from a fresh two-device artifact whose verifier enforces every field, a freshness window, exact image/source/generation, and retained capture hashes.

### RH-P0-07 — Deployment tests can be green while the deployed product is broken

**Severity**: CRITICAL<br>
**Status**: open

- Valuable live tests are guarded by `PLATFORM_IT` and commonly skipped by the default suite.
- Local health is non-strict unless production readiness is enabled and can return 200 without fleet readiness.
- The mission off-HTTP test does not require a terminal completed mission or real model trace.
- The scheduler test ends before one 30-second heartbeat and does not assert connection cardinality.
- The 16-job scheduler test proves invocation counts, not the durable effect of each job.
- MCP rehost and manifest gates check names, switch cases, schemas, and fixtures. They do not catch semantic no-ops or false-success mutations.
- The iOS decommission build uses shared DerivedData and was blocked by another real build.

**Required oracle**: promotion must execute an always-on deployed-service suite with real Postgres, fleet, scheduler, MCP calls, Zero, and simulator, and must fail if any required live lane is skipped.

---

## MEDIUM-Confidence Findings

These are direct source defects or two-reviewer consensus findings that require remediation, even when current live execution was unavailable.

### Backend and mission engine

1. **Mission listing is an explicit production stub.** [`hono-app.ts`](../../services/platform/src/http/hono-app.ts) lines 1066–1075 always return 501 `MISSION_LIST_NOT_IMPLEMENTED`. A test accepts either 200 or 501, normalizing the stub.
2. **The central Mastra composition has no agents or workflows.** [`index.ts`](../../services/platform/src/index.ts) lines 65–79 registers `agents: {}` and `workflows: {}` while the MK-VI PRD describes Mastra mission workflows. Either implement the architecture or amend the claim deliberately.
3. **Scheduler lacks fleet configuration.** [`compose.yaml`](../../services/platform/deploy/compose/compose.yaml) lines 90–125 inject only the database secret; no `FLEET_URL` or `FLEET_KEY` reaches model-backed scheduler work.
4. **Health does not cover operational readiness.** A green `/health` would not prove scheduler liveness, recent job heartbeats, backup age, alert delivery, or restore viability.
5. **Mission tests permit permanent queued/failing work.** They prove acceptance/persistence and timing, not a completed terminal result, real model output, or finished lease.

### MCP surface

6. **`check_subscriptions` is a semantic stub.** [`executor.ts`](../../services/platform/src/mcp/executor.ts) lines 845–852 counts sources, ignores the requested source type, returns `totalFetched=0` and `totalQueued=0`, and performs no fetch, queue, content write, or `last_checked` update.
7. **Several mutations claim success when no row changed.** `update_document`, `update_tool`, `share_document`, and `close_improvement` do not consistently use `RETURNING` or declared not-found errors.
8. **Idempotency is race-prone.** Sequential select-then-insert tests pass, but `subscription_sources` lacks the uniqueness constraint needed to prevent concurrent duplicates.
9. **Ten tools omit MCP `outputSchema`.** The gateway only forwards exact Zod objects, dropping nullable/array output schemas from discovery.
10. **Manifest and executor disagree.** `hybrid_search` returns `postgres-fts` outside the declared enum; document pagination ignores cursor and always returns `nextCursor=null`; assimilation steering overwrites rather than appends.
11. **Legacy stdio is not the canonical transport.** It uses permissive passthrough schemas and rethrows expected errors instead of sharing the same validation/error envelope as the platform gateway.
12. **Empty MCP success is not product proof.** A 44-tool list plus zero-row reads can pass while the target database or corpus is wrong.

Per the project rule for this personal tailnet app, API-key authentication is treated as intentional. The generic MCP review's OAuth/PKCE recommendation is not a blocker in this plan unless the product boundary changes to untrusted third-party clients.

### React Native and Zero client

13. **Conversation state is hardcoded to healthy-empty.** [`app/(drawer)/_layout.tsx`](<../../app/(drawer)/_layout.tsx>) hardcodes `isLoading=false`, `error=null`, and a no-op retry, making a Zero outage look like an empty drawer.
14. **Missing configuration silently falls back to test-local identity.** [`app/_layout.tsx`](../../app/_layout.tsx) mounts Zero at loopback with `e2e-reference-user` instead of rendering a terminal configuration failure.
15. **Retired cloud hosts are warned about but still used.** [`app/zero/platform.ts`](../../app/zero/platform.ts) can return a retired host after logging a warning, and command calls continue through it.
16. **Chat error classification is misleading.** Generic DNS, refused-connection, fetch, and reset failures are labeled “Local fleet unavailable,” hiding wrong-host and platform outages.
17. **Failed streams can become complete.** A non-fleet terminal failure sets an error but finishes with `complete`; final polling/hydration failures are swallowed.
18. **Mission success is inferred from any 2xx JSON.** Toolbelt shows “Added” without response-schema validation, durable run observation, or a mission list/status surface.
19. **What's New fabricates freshness.** Missing reports become a synthetic `seed-feed-items` report with `Date.now()`, and refresh errors are swallowed.
20. **Research errors masquerade as not-found or live stale data.** Sync errors become “Research session not found,” and old props can render without an explicit stale/degraded state.
21. **Custom Zero mutations are not proven durable.** Source says server registration through `mutateURL` is still expected, while the provider does not configure it.
22. **Article import and voice reconciliation hide failures.** Import errors only log; missing rows become empty arrays; closing an unknown durable voice session is treated as success.

### Operator and gate surfaces

23. **CLI provenance is inconsistent.** Local bare `holo` is absent; `inference1` has a stale installed CLI that lacks `backup:status`; runbooks mix `holo`, `./bin/holo`, and direct Bun entrypoints.
24. **The decommission inventory cannot be rerun after deletion.** `verify:decommission-inventory --json` exits 1 on the intentionally absent `convex/` directory, although the runbook still requires it in G1.
25. **The full no-Convex gate is concurrency-fragile.** Its iOS build uses shared DerivedData/SwiftPM state; no mandated worktree-local wrapper exists in this checkout.
26. **Legacy operational ownership is unclear.** `inference1` still runs Postgres, Mastra, Zero Cache, and scheduler LaunchAgents while `holocron` is described as the production mini. An explicit primary/standby role and writer fence are absent from current evidence.
27. **Disk/log pressure is material.** `inference1` was 92% full with about 36 GiB free; Holocron logs used roughly 667 MiB, including a scheduler log around 571 MiB.

---

## Agent Contradictions and Resolution

| Topic | Evidence A | Evidence B | Resolution |
|---|---|---|---|
| D08-09 status | Task markdown records the original blocked run with zero metrics. | A later retained artifact records a complete two-device pass on 2026-08-14. | The artifact supersedes the old run historically, but neither is current production proof. Make the artifact the canonical generated status and rerun it for the promoted release. |
| Deployment health | Historical drill shows the exact image/source/generation healthy. | Current checks first showed 503/fleet failure, then the device went offline. | Configuration/host state drifted without image drift. Historical image proof cannot replace runtime proof. |
| D08-03 eligibility | Summary JSON says pass and carries 12 SHA-256 strings. | All 12 files are missing and the verifier still passes. | Gate is invalid. Strings without retained bytes are not evidence. |
| MCP completeness | Discovery returns exactly 44 tools and structural gates pass. | Advertised tool behavior includes no-ops, false success, schema drift, and empty corpus. | Registration completeness is retained as a narrow PASS; behavioral parity is FAIL. |
| Queue readiness | Health previously reported queue ready. | Scheduler leaked connections until Postgres reported too many clients. | A writable readiness row is not a lifecycle/leak oracle. Add connection and job-heartbeat readiness. |
| Client “fail closed” | Source comments describe loopback fallback as fail-closed. | Provider actually mounts loopback with a fixture identity. | The implementation is fail-open/test-default behavior and must be replaced with a terminal configuration state. |

---

## Narrow Positive Evidence

The review does not discard the parts that worked:

- Unauthenticated `/api/missions` and `/mcp` calls returned 401 before the host went offline.
- Authenticated MCP initialize and discovery returned 44 registered tools.
- The local inference fleet served real implementer, reviewer, and verifier completions.
- Source/dependency/legacy-path portions of `verify:no-convex` reported zero residue before the iOS build failed.
- The narrow client import verifier reported no `convex/react` imports under app/components/hooks/screens.
- The 2026-08-14 D08-09 capture is a useful historical baseline and includes real negative controls; it is simply stale for current readiness.
- Health correctly degraded on the fleet dependency rather than reporting a false 200.

---

## Required Remediation Order

1. **Keep D08-05 closed.** Preserve Convex until the current Postgres corpus, backups, restore, and two-device deployment proof are all green.
2. **Recover the authoritative host and fleet route.** Establish SSH, host uptime, service state, exact runtime identity, and in-container fleet reachability.
3. **Stop the PgBoss leak and restore Postgres headroom.** Prove bounded connections before restarting long-lived scheduler service.
4. **Repair installed backups and alerting.** Remove worktree-coupled paths; produce fresh heartbeats and a real isolated restore.
5. **Lock the deployed data plane to non-empty Postgres.** Reconcile ETL/corpus identity across HTTP, MCP, Zero, and DB.
6. **Close product semantic stubs.** Mission list/lifecycle, subscription checks, MCP mutation truth, client configuration/state/error truth, and durable Zero mutations.
7. **Make gates fail closed.** Evidence existence/hash/freshness, exact binary/release provenance, isolated native builds, always-on deployed-service tests, and semantic MCP oracles.
8. **Promote one exact validated release.** Run a 24-hour then 72-hour soak with connection, queue, backup, and log-growth SLOs.
9. **Rerun D08-03 and D08-09 from fresh evidence.** Only then request an explicit human D08-05 authorization.

The implementation-ready plan is in [`../prd/holocron-hardening/README.md`](../prd/holocron-hardening/README.md).

---

## Metadata

- **Review duration**: approximately 45 minutes of fanout, live diagnostics, reconciliation, and planning.
- **Specialist agents**:
  - migration/cutover reviewer — Convex export, data-plane and deletion-gate truth.
  - Mastra reviewer — health, deployment, mission engine, scheduler, and backup contracts.
  - MCP reviewer — 44-tool behavioral and transport parity.
  - React Native reviewer — Zero state, mission/chat/research/upload client truth.
  - test-quality standing seat — false-green gates, weak oracles, skipped live lanes, and lifecycle coverage.
- **Root independent checks**: live tailnet health, inference fleet, authenticated read-only MCP, `inference1` LaunchAgents/backups/Postgres, decommission gates, release ancestry, and source confirmation.
- **Handoff validation**: `pnpm typecheck` passed; `pnpm prd:consistency` passed with 60 tables, 44 tools, and 26 use cases; `pnpm test` was non-zero with failures across legacy Convex tests, native human-gate contracts, deployment/resilience gates, MCP rehost/idempotency, and other integration lanes. No green-suite claim is made.
- **Confidence model**: HIGH = three-reviewer consensus or independently reproduced live/source failure; MEDIUM = direct source defect or two-reviewer consensus; LOW = single-reviewer inference. No LOW-only finding is used as a release blocker.
- **No mutation performed**: production, network, device, simulator, credentials, and application code remained unchanged.
