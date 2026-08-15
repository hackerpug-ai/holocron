# Holocron MK-VI Recovery and Hardening Plan

**Status**: Proposed — implementation not started<br>
**Date**: 2026-08-15<br>
**Source review**: [`../../reviews/red-hat-mk6-code-deployment-20260815T232122Z.md`](../../reviews/red-hat-mk6-code-deployment-20260815T232122Z.md)<br>
**Scope**: production recovery, MK-VI semantic completion, deployment hardening, and decommission-proof repair<br>
**Default production authority**: `holocron` is primary; `inference1` is diagnostic/recovery infrastructure until an operator deliberately changes that topology<br>

---

## Outcome

Restore Holocron as a truthful, non-empty, Postgres-backed personal service on the tailnet, with:

- one authoritative production host and release identity;
- reachable local-fleet inference from every model-consuming service;
- bounded scheduler/Postgres resource use;
- fresh, alerting, restorable backups;
- real mission, subscription, MCP, Zero, and client behavior without semantic stubs;
- promotion gates that fail when live tests are skipped, evidence is stale/missing, or native builds share unsafe state; and
- a current two-device recovery proof before any irreversible Convex deletion.

This is complete only after the promoted exact release survives a 72-hour soak and a fresh restore plus D08-09 drill. Source fixes, passing unit tests, a 44-tool list, or a historical artifact are not completion.

---

## Non-Goals and Fixed Decisions

- Do not delete, disable, or mutate the Convex cloud deployment until Phase 4's explicit human gate.
- Do not disrupt Tailscale, Wi-Fi, host networking, or device connectivity as a test technique.
- Do not restart or stop production dependencies without an operator-approved window and an automatic recovery trap.
- Do not replace real behavior with fixtures, no-op handlers, canned success, or skipped live suites.
- Keep API-key authentication for this personal tailnet app. OAuth/PKCE is out of scope unless the trust boundary changes.
- Do not redesign visual presentation except where an accurate error/loading/stale state requires it.
- Do not treat `inference1` as a second active writer. It must have an explicit primary/standby/recovery role before services remain enabled there.

---

## Program Invariants

1. **One release**: every receipt carries source SHA, immutable image digest, compose generation, host identity, and deployment timestamp.
2. **One data plane**: HTTP, MCP, Zero, scheduler, and direct database checks agree on Postgres and on at least one known durable identity.
3. **One queue backend per process**: repeated readiness/heartbeat work never allocates an unbounded pool or worker.
4. **Evidence includes bytes**: manifests fail on missing files, changed bytes, stale timestamps, wrong identity, or unretained paths.
5. **Empty is not proof**: a success oracle must use known non-empty records and verify side effects/readback.
6. **Errors remain errors**: missing config, failed streams, rejected mutations, missing rows, and stale cache are never rendered or returned as success/complete/current.
7. **Promotion is live**: the exact candidate is exercised from outside its containers and from a real client before it becomes authoritative.
8. **Deletion is manual**: only an explicitly authorized operator may cross D08-05 after every preceding invariant is current and green.

---

## Critical Path

```text
P0 incident hold
  -> host access + topology truth
  -> fleet route + PgBoss lifecycle
  -> backup/alert/restore recovery
  -> Postgres corpus + singular data plane
  -> backend/MCP/client semantic completion
  -> fail-closed gates + isolated builds
  -> exact release promotion
  -> 24h/72h soak
  -> fresh D08-03 + D08-09
  -> human D08-05 decision
```

No downstream phase may waive an upstream failure. Work may be implemented in parallel only where the real acceptance environments do not share mutable databases, simulators, build caches, or deployment ownership.

---

## Phase 0 — Safety Hold and Runtime Recovery

### H0-01 — Declare and inspect the authoritative host

**Owner**: devops-engineer<br>
**Depends on**: operator access to `holocron`<br>
**Goal**: restore tailnet reachability and SSH, determine why the host went offline, and record current immutable runtime facts.

Implementation:

- Restore normal host availability without changing network configuration as a test.
- Make key-based SSH work through the stable alias; do not add passwords to commands or artifacts.
- Capture host uptime, sleep/power state, disk, memory, Docker state, four service states, bounded logs, Tailscale Serve/Funnel status, and the last crash/restart reason.
- Record exact image/source/generation and compare them to the candidate release.
- Decide and document whether `inference1` services are standby, recovery-only, or obsolete; fence any unintended second writer.

Acceptance:

- Two authorized tailnet devices reach the host and private Serve endpoint.
- SSH read-only diagnostics succeed through the stable alias.
- Exactly one production writer topology is documented and enforced.
- No Funnel endpoint exists.
- A redacted incident timeline explains the transition from 503 to offline.

### H0-02 — Correct fleet routing for every consumer

**Owner**: mastra-implementer + devops-engineer<br>
**Depends on**: H0-01

Implementation:

- Remove production inference from loopback/`host.docker.internal` assumptions unless a fleet actually runs on that Docker host.
- Make the consolidated fleet endpoint an explicit tailnet URL and validate it during deploy preflight.
- Inject the same endpoint and scoped credential into both Mastra and scheduler.
- Reject loopback or retired/unreachable production targets before compose apply.
- Keep the actual value secret; receipts store only host hash and reachability result.

Acceptance:

- From inside both candidate containers, authenticated `/v1/models` returns the expected aliases.
- Each container completes one real non-destructive inference request.
- Wrong host, missing key, and unreachable route each fail preflight before promotion.
- Three consecutive external health requests return 200 with `fleet.ready=true`.

### H0-03 — Make queue lifecycle bounded and observable

**Owner**: mastra-implementer<br>
**Reviewer**: mastra-reviewer + test-quality-reviewer<br>
**Depends on**: isolated real Postgres fixture

Implementation:

- Make `startQueueBackend` idempotent and concurrency-safe.
- Reuse the running PgBoss instance or stop/await the previous instance before replacement.
- Make readiness a probe, not a worker constructor.
- Ensure SIGTERM and scheduler exit close every pool and worker.
- Add explicit scheduler heartbeat time, job lease age, connection count, and failure reason to operational readiness.

Acceptance:

- Real scheduler runs for at least 120 seconds and three heartbeat intervals.
- `holocron-pg-boss` connection count remains within an agreed fixed ceiling with zero monotonic growth.
- One queued job completes and persists its expected result.
- Concurrent start calls produce one backend instance.
- Graceful stop leaves zero application-owned PgBoss sessions.
- A lifecycle mutant that recreates the backend every heartbeat fails the test.

### H0-04 — Repair installed backups, alerts, and retention

**Owner**: devops-engineer<br>
**Reviewer**: security-reviewer for secret handling; test-quality-reviewer for restore oracle<br>
**Depends on**: H0-01, stable installed CLI path

Implementation:

- Reinstall LaunchAgents with stable release/install paths, never sprint/worktree paths.
- Align the installed `holo` binary/version with the deployed release and record its build identity.
- Configure base backup, WAL archive, cleanup, blob mirror, and alert sweep from the canonical secret store.
- Bound and rotate logs.
- Deliver alerts to the intended real endpoint.
- Perform a test-scoped R2 backup and isolated restore using the distinct restore tuple.

Acceptance:

- Installed and loaded units point only at stable existing paths.
- Base, WAL, cleanup, blob mirror, and all-clear heartbeats are fresh within their SLOs.
- R2 object counts are non-null and advance after a controlled backup.
- A real overdue/failure condition produces one alert receipt; recovery clears it.
- A fresh isolated restore passes row, FK, PONR ledger, and blob parity.

### H0-05 — Establish the non-empty Postgres data plane

**Owner**: mastra-implementer with convex-implementer limited to read-side export archaeology<br>
**Reviewer**: convex-reviewer + mastra-reviewer<br>
**Depends on**: H0-01 through H0-04

Implementation:

- Complete or rerun the live Convex export/fidelity proof without deleting the source.
- Reconcile expected source counts/hashes to Postgres tables and file/blob objects.
- Set the observed production data plane to Postgres only after a transactional cutover record.
- Make every content path use the same observed-plane decision and fail closed on mismatch.
- Seed/select immutable sentinel identities for ongoing cross-surface checks.

Acceptance:

- Health reports `data_plane=postgres` and the expected target.
- Direct Postgres, `/api/content-probe`, MCP get/list, and Zero return the same known document identity and content hash.
- Domain counts are non-zero and reconcile to the signed export contract.
- A forced Convex/wrong-database/missing-sentinel condition fails promotion.
- Rollback preserves both source and target; no cloud deletion occurs.

### Phase 0 exit gate

All H0 acceptance criteria pass against real services. Production is reachable and stable, scheduler connections are bounded, backups are fresh and restorable, and the data plane is non-empty Postgres. Until this gate passes, no product-semantic rollout or decommission work may be called release-ready.

---

## Phase 1 — Make Product Behavior Truthful

### H1-01 — Complete mission lifecycle and choose the Mastra contract

**Owner**: mastra-implementer<br>
**Reviewer**: mastra-reviewer

Implementation:

- Implement authenticated mission listing with pagination and scope filtering.
- Schema-validate mission creation responses and expose queued/running/completed/failed states.
- Require terminal durable outcomes, lease ownership, and trace/model evidence.
- Decide explicitly between registered Mastra workflows/agents and a custom Postgres mission engine. If MK-VI keeps the Mastra claim, register and execute the real definitions at the central composition root; otherwise revise the architecture contract before implementation.
- Remove tests that accept 501 or never require terminal state.

Acceptance:

- A real deployed mission appears in list/status, reaches `completed`, records a model trace, and produces its intended non-destructive side effect.
- Invalid input, wrong scope, fleet failure, duplicate submission, and process restart produce truthful durable states.
- A permanently queued or fabricated 2xx response fails the suite.

### H1-02 — Implement subscription checking or remove it

**Owner**: mcp-implementer + mastra-implementer<br>
**Reviewer**: mcp-reviewer

Implementation:

- Honor `sourceType` and enabled-source selection.
- Fetch actual configured sources through the real adapter.
- Deduplicate and persist `subscription_content`, update `last_checked`, and queue downstream work.
- Return truthful fetched/queued/error totals.
- If the capability is intentionally deferred, remove it from the production registry and manifest instead of returning zeros.

Acceptance:

- A controlled real feed yields measurable Postgres content and queue deltas.
- Replay produces no duplicate content.
- Source filter, upstream error, malformed content, and disabled source are covered.
- Hardcoded zero/no-write mutants fail.

### H1-03 — Reconcile all 44 MCP behavior contracts

**Owner**: mcp-implementer<br>
**Reviewer**: mcp-reviewer + test-quality-reviewer

Implementation:

- Make update/close/share/delete paths use `RETURNING` and declared not-found errors.
- Add database uniqueness or an idempotency ledger for concurrent replays.
- Expose canonical output schemas for all 44 tools.
- Align hybrid-search enums, pagination/cursors, append semantics, and every manifest fixture with executable behavior.
- Make legacy stdio use the canonical registry/validation/error envelope or retire it.
- Generate structural manifests from source where possible; retain real behavioral receipts separately.

Acceptance:

- MCP Inspector invokes all 44 tools against a seeded, non-empty real Postgres corpus.
- All read results validate their output schema.
- Every mutation proves its exact row/blob/queue side effect and readback.
- Two simultaneous idempotent calls leave one row and one stable identity.
- Missing targets return the declared error, never success.
- Platform HTTP and retained stdio have equivalent results and error envelopes.

### H1-04 — Fail closed on client configuration and data identity

**Owner**: react-native-ui-implementer<br>
**Reviewer**: react-native-ui-reviewer

Implementation:

- Remove production loopback and `e2e-reference-user` defaults.
- Reject retired hosts for every platform call.
- Render an actionable terminal configuration state before mounting Zero when identity, cache URL, or platform identity is missing/invalid.
- Bind the client to a health/identity response that proves the expected Postgres plane and release.

Acceptance:

- On a real simulator, absent config, loopback production config, retired host, wrong plane, and wrong release each render a terminal error and make no fallback request.
- Correct config connects to the deployed Zero endpoint and observes the known sentinel.

### H1-05 — Replace client lifecycle stubs with explicit state unions

**Owner**: react-native-ui-implementer<br>
**Reviewer**: react-native-ui-reviewer + test-quality-reviewer

Implementation:

- Drive drawer loading, defined-empty, stale, error, retry, mutation-pending, and mutation-error states from real Zero/watchdog state.
- Propagate rename/delete errors rather than logging only.
- Distinguish platform/network/retired-host errors from trusted fleet-unavailable codes.
- Never map a failed stream, poll, or hydration to `complete`.
- Render research stale/error separately from not-found.
- Remove fabricated What's New reports and expose refresh failures.

Acceptance:

- Real Zero stop/recovery does not show a healthy-empty drawer; retry reconnects and restores rows.
- Real wrong host, API 500, fleet unavailable, stalled SSE, terminal failure, and hydration failure render distinct truthful states.
- Empty What's New remains empty; stale research is labeled stale; current timestamps are never fabricated.

### H1-06 — Make client mission and mutation success durable

**Owner**: react-native-ui-implementer + mastra-implementer<br>
**Reviewer**: react-native-ui-reviewer

Implementation:

- Parse mission create/status responses with shared schemas.
- Observe queued/running/completed/rejected state before showing success.
- Register and prove custom Zero mutators through the real mutation endpoint, including rejection and rebase.
- Make upload, import, and voice close reconcile exact durable rows and surface missing/failed state.

Acceptance:

- Mission creation is observed through Hono, Postgres, Zero, and the client on two clients.
- `{}` or wrong-shape 2xx responses fail.
- One real custom mutation is seen by a second client and direct Postgres.
- Mutation rejection rolls back optimistic state visibly.
- Unknown voice session and import failure render errors rather than success/empty.

### Phase 1 exit gate

Every advertised backend/MCP/client capability has a real service oracle. No required product path contains a no-op retry, hardcoded success count, synthetic fresh data, accepted 501, or swallowed terminal failure.

---

## Phase 2 — Make Verification and Evidence Fail Closed

### H2-01 — Repair D08-03 evidence retention and validation

**Owner**: devops-engineer<br>
**Reviewer**: test-quality-reviewer

Implementation:

- Move required gate captures from ephemeral `.tmp` into an immutable retained bundle or content-addressed object store.
- Require every manifest target to exist, match byte count, and rehash.
- Bind gate run ID, restore target, source/target identity, timestamps, and release identity.
- Add negative tests for one missing file, one changed byte, one stale capture, one wrong host, and one wrong restore database.
- Mark the current D08-03 artifact invalid rather than mutating it into a pass.

Acceptance:

- Current false-green artifact fails.
- Every negative control fails for the expected reason.
- A new real restore generates a complete retained bundle and passes from a cold checkout.

### H2-02 — Make D08-09 current, complete, and canonical

**Owner**: devops-engineer<br>
**Reviewer**: test-quality-reviewer + mastra-reviewer

Implementation:

- Make the portable verifier require `status=pass`, a bounded freshness interval, exact image/source/generation, four services, 503/recovery, restart, both sentinels, all three negative controls, two real devices, no Funnel, zero credential values, and capture hashes.
- Generate task status from the sealed artifact so old blocked prose cannot conflict with a later pass.
- Require a rerun after any behavioral release or operational recovery.

Acceptance:

- Removing or zeroing any required field fails the gate.
- A historical timestamp or wrong release fails.
- Fresh authorized two-device execution passes and leaves services restored.

### H2-03 — Establish exact CLI and runtime provenance

**Owner**: devops-engineer

Implementation:

- Select one canonical operator entrypoint (`./bin/holo` for source checkout or a versioned installed binary for deployed hosts).
- Add `holo build-info --json` and require its SHA/version in every gate.
- Remove mixed bare/source commands from runbooks.
- Make decommission inventory consume a retained pre-delete inventory after the source directory is intentionally removed; do not require walking a directory that no longer exists.

Acceptance:

- Laptop and host commands resolve to the intended binary and exact release.
- An old or unexpected PATH binary fails before work begins.
- G1 can be rerun after source deletion using the immutable pre-delete inventory plus current no-residue scan.

### H2-04 — Isolate native build state

**Owner**: react-native-ui-implementer + devops-engineer<br>
**Reviewer**: react-native-ui-reviewer

Implementation:

- Add and require a worktree-local native build environment script and wrapper.
- Route DerivedData, SwiftPM caches, and hook-owned Xcode outputs to the assigned worktree.
- Bind build artifact provenance to source SHA and reject an older artifact.

Acceptance:

- Two concurrent disposable-worktree iOS builds do not share a build database or cache directory.
- Each artifact records and matches its own SHA.
- The full no-Convex gate succeeds without waiting for or consuming another build's output.

### H2-05 — Replace structural/count oracles with behavior oracles

**Owner**: test-quality-reviewer defines mutants; domain implementers own tests<br>
**Reviewers**: all domain reviewers

Implementation:

- Make live lanes mandatory for promotion; skipped tests are a failing promotion result.
- Add scheduler lifecycle and one real effect per standing job.
- Add terminal mission, non-empty data-plane, and all-44 MCP behavior tests.
- Add client cache-down/recovery, stream-failure, and durable mutation tests on a real simulator.
- Maintain a small mutation suite for load-bearing seams: queue reuse, evidence existence, terminal mission state, subscription writes, client fail-closed config, and failed-stream state.

Acceptance:

- Each listed mutant is killed by a production-path test.
- Tests use isolated real Postgres, real filesystem/blob storage, real Hono/MCP servers, real fleet, real Zero, and a real simulator as applicable.
- No required lane reports success when its service is absent.

### H2-06 — Create one deployment-promotion gate

**Owner**: devops-engineer<br>
**Reviewer**: integration-validator

The gate must verify, in order:

1. candidate source SHA and immutable image digest;
2. compose and secret-name preflight without printing values;
3. in-container fleet model list and completion from Mastra and scheduler;
4. three external private health 200 responses;
5. non-empty Postgres data-plane identity across HTTP/MCP/Zero;
6. terminal mission plus scheduler job side effect;
7. all-44 MCP behavioral sweep including declared failure paths;
8. real iOS simulator launch, Zero sync, mission state, and one durable mutation;
9. fresh backup heartbeats and alert readiness; and
10. automatic rollback on any failure before authority changes.

Acceptance:

- Every step emits a redacted receipt bound to the same release.
- One seeded negative control per dependency makes promotion fail before cutover.
- The gate cannot consume historical receipts as current evidence.

### Phase 2 exit gate

All required verification is runnable from a clean checkout and exact installed runtime. Evidence is retained, current, hash-bound, identity-bound, and behaviorally non-empty.

---

## Phase 3 — Promote and Soak One Exact Release

### H3-01 — Produce and promote the candidate

**Owner**: integrator + devops-engineer<br>
**Depends on**: Phases 0–2 green

- Land reviewed implementation commits on `main` through normal hooks.
- Push the exact trunk SHA.
- Build one immutable image and record its digest.
- Run H2-06 against the candidate.
- Promote only that digest; do not rebuild between verification and deploy.
- Re-run build-info and health from the installed runtime.

### H3-02 — Run a 24-hour then 72-hour soak

**Owner**: observability-engineer

Track at minimum:

- availability and dependency-specific health;
- PgBoss and total Postgres connections, queue depth, lease age, job failures, and scheduler restarts;
- fleet latency/errors and escape-hatch spend;
- Zero replication lag and client reconnect/error counts;
- backup heartbeat age, R2 object growth, alert delivery, and last restore age;
- disk free space and per-service log growth; and
- mission/MCP/client semantic canaries against known non-empty identities.

Acceptance:

- No monotonic connection or log leak.
- No unplanned restart or false-success canary.
- Every backup SLO remains fresh.
- An induced test-scoped dependency failure alerts and recovers.
- Both 24-hour and 72-hour receipts bind to the same digest and SHA.

---

## Phase 4 — Fresh Recovery Proof and Optional Convex Decommission

### H4-01 — Rerun D08-03

Run a new fresh-hardware restore with the corrected evidence system. The target must be isolated and use the distinct restore credential tuple. Verify row, FK, PONR, blob, app, Zero, and MCP behavior against the current release.

### H4-02 — Rerun D08-09

Under an approved disruption window, run the complete two-device private recovery drill against the promoted release. Restore all services in traps/finally and retain the full signed/hash-bound bundle.

### H4-03 — Human D08-05 decision

Only after H4-01 and H4-02 pass and the 72-hour soak remains green:

- verify provider account, organization, environment, and deployment fingerprint;
- record explicit named/timestamped human authorization;
- perform the manual irreversible deletion;
- capture a redacted provider receipt; and
- prove the Convex surface is unreachable while Holocron remains healthy and non-empty on Postgres.

If any identity, receipt, freshness, restore, health, or data-plane check is missing, stop. Retaining Convex longer is the correct result.

---

## Work Package Map

| ID | Work package | Primary owner | Blocks |
|---|---|---|---|
| H0-01 | Host access, incident timeline, topology authority | devops-engineer | all runtime work |
| H0-02 | Fleet routing and container preflight | mastra-implementer | missions, scheduler, promotion |
| H0-03 | PgBoss lifecycle and connection SLO | mastra-implementer | scheduler soak |
| H0-04 | Backup/alert/restore recovery | devops-engineer | D08-03, decommission |
| H0-05 | Non-empty Postgres data plane | mastra-implementer | MCP, Zero, decommission |
| H1-01 | Mission lifecycle + Mastra architecture | mastra-implementer | client mission proof |
| H1-02 | Subscription fetch/queue behavior | mcp-implementer | MCP parity |
| H1-03 | 44-tool behavioral parity | mcp-implementer | promotion |
| H1-04 | Client fail-closed configuration | react-native-ui-implementer | client e2e |
| H1-05 | Client loading/error/stale/terminal truth | react-native-ui-implementer | client e2e |
| H1-06 | Durable mission and Zero mutations | react-native-ui-implementer | promotion |
| H2-01 | D08-03 fail-closed evidence | devops-engineer | D08-03 rerun |
| H2-02 | D08-09 freshness/completeness | devops-engineer | D08-09 rerun |
| H2-03 | CLI/runtime provenance | devops-engineer | all gates |
| H2-04 | Worktree-local iOS build isolation | react-native-ui-implementer | no-Convex/client gate |
| H2-05 | Semantic/mutation test net | domain implementers | promotion |
| H2-06 | Unified promotion gate | devops-engineer | release |
| H3-01 | Exact release build/promotion | integrator | soak |
| H3-02 | 24h/72h soak | observability-engineer | decommission |
| H4-01 | Fresh D08-03 restore | devops-engineer | deletion decision |
| H4-02 | Fresh D08-09 drill | devops-engineer | deletion decision |
| H4-03 | Manual D08-05 | authorized operator only | closure |

---

## Release Scorecard

Every row is blocking.

| Area | Pass condition |
|---|---|
| Host | online, SSH-observable, one authoritative writer, no Funnel |
| Release | exact source SHA, immutable image, generation, installed CLI identity agree |
| Health | three external 200 responses; all dependency and operational readiness fields green |
| Fleet | both Mastra and scheduler perform real in-container completions |
| Postgres | non-empty expected corpus and sentinel hashes reconcile |
| Queue | bounded connections, live heartbeat, real job terminal outcome |
| Mission | create/list/status/terminal/trace/restart and failure behavior pass |
| MCP | all 44 discovered and behaviorally invoked with schemas, side effects, and errors |
| Zero/client | real simulator sync, truthful offline/error states, second-client durable mutation |
| Backup | fresh base/WAL/blob/cleanup/all-clear, alert receipt, successful isolated restore |
| Evidence | files retained, hashes recompute, fresh, release-bound, negatives have teeth |
| Soak | 24h and 72h stable with no leak, false success, or missed SLO |
| Decommission | fresh D08-03 and D08-09 plus explicit operator authorization |

---

## Evidence That Does Not Count

- “Tests pass” when real lanes were skipped.
- A 44-tool registration count without `tools/call` and durable readback.
- Empty successful reads.
- Fixture/schema/manifest agreement without executing the production handler.
- A health 200 that omits scheduler, backups, restore age, or release identity.
- A historical two-device drill for a currently unhealthy or different release.
- A digest string whose referenced bytes are missing.
- A source fix that was not built, installed, promoted, and exercised.
- A simulator screenshot without server/Zero/Postgres identity correlation.
- A task checkbox or summary generated from a different run.

---

## Rollback and Stop Conditions

Rollback to the last known healthy immutable image while retaining both databases if any of these occur:

- health or fleet readiness fails after promotion;
- Postgres connections grow across heartbeat intervals;
- scheduler misses its heartbeat or repeats side effects;
- sentinel identities disagree across surfaces;
- Zero fails to converge or client errors masquerade as empty/success;
- backup heartbeat or alert delivery misses SLO;
- evidence identity differs from the deployed release; or
- disk/log growth exceeds the agreed ceiling.

Stop the decommission sequence immediately if the source/target identity, restore tuple, provider identity, current artifact freshness, or explicit human authorization is unclear.

---

## Planning Pipeline Note

Project instructions require `/kb-project-plan` after a plan is created. That named skill/command is not available in the current Codex skill roster, so no substitute task generation was fabricated. Before execution, restore the canonical pipeline entrypoint or explicitly authorize the available replacement, then generate task files from this plan with the work package IDs and acceptance criteria above intact.
