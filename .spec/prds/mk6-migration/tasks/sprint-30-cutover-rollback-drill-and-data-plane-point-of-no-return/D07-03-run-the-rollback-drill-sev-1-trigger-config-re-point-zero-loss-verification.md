# D07-03: Run the rollback drill — Sev-1 trigger, config re-point, zero-loss verification

> **Task ID:** D07-03
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 120 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-04, T-SYNC-013

## Specification

**Objective.** Make UC-SYNC-04 AC-2 / T-SYNC-013 an executable, un-fakeable drill: seed a real Sev-1 gate failure, prove five representative write surfaces are visibly blocked, drive the real rollback-repoint CLI end-to-end, independently recompute zero-loss from raw evidence rather than trusting the report's self-certified ok field, and correctly REFUSE rollback when accepted post-export writes are non-zero.

**Success state.** `holo cutover:rollback-drill --json` produces a DrillReport whose ok:true requires: (1) a real failing verify-tools report as the declared Sev-1 trigger, (2) all five write surfaces independently confirmed blocked, (3) the real `cutover:rollback-repoint --json` CLI exits 0 with repointed:true, (4) the drill's own independent recompute of accepted_post_export_writes from raw audit bytes equals the report's value (both 0), and (5) at least one authorizing, pre-existing acknowledgement in report.acknowledgements. With N=3 accepted writes seeded via the real audit entrypoint, the same drill against that fixture reports ok:false, repointed:false, error.code=POST_EXPORT_WRITE_ACCEPTED, and the independently recomputed acceptedCount===3.

## Critical Constraints

- **MUST** — MUST derive the Sev-1 trigger from a real failing call to runVerifyTools()/cutover:verify-tools against a genuinely unreachable base URL — never a hand-set `sevOne: true` flag
- **MUST** — MUST recompute accepted-post-export-write count via a code path independent of runRollbackRepoint()'s internal use of the same functions: load the raw audit JSON file bytes directly and recompute, then compare against the repoint report's precondition.accepted_post_export_writes — both must agree, and the drill fails closed if they don't
- **MUST** — MUST drive the real registered `cutover:rollback-repoint --json` CLI as a child process (not call runRollbackRepoint() only in-process) so the drill proves the operator-facing command, matching the shared-context's explicit instruction
- **MUST** — MUST pair the zero-loss (N=0) case with a non-degenerate N=3 positive case seeded via the real writePostExportWriteAudit() entrypoint, asserting refusal with acceptedCount===3 exactly (not merely >0)
- **MUST** — MUST probe all five representative write surfaces named in the PRD (app mutation, MCP tool write, upload, scheduled job, mission-commit) against a live pre-existing server — not a subset, not a generalized single check
- **NEVER** — NEVER treat the repoint report's own `ok`/`repointed` fields as sufficient proof of zero-loss without the independent raw-file recompute matching
- **NEVER** — NEVER seed accepted post-export writes into the real production audit path via a production CLI flag — the N>0 refusal case is proven only in the integration test against disposable fixture paths
- **NEVER** — NEVER use in-process createHonoApp() as the acknowledging serving unit for the live-ack check (R3-H03 precedent) — the pre-existing process must be started before the drill's control-plane write
- **STRICTLY** — STRICTLY use disposable secrets.yaml / audit / watermark paths for every drill run — never mutate the operator's real secrets.yaml or the production post-export-write audit

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** cutover:verify-tools is pointed at a genuinely unreachable base URL
- **WHEN** the drill's trigger phase runs runVerifyTools({baseUrl: deadUrl})
- **THEN** the drill's sevOneTrigger carries a real failing report with toolsPassed=0 out of a non-zero toolsTotal, sourced from the same runVerifyTools() code path cutover:verify-tools itself uses

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-1`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `broken_verify_tools_target`
    - action: run `holo cutover:rollback-drill --base-url <dead-url> --json`
    - MUST observe: drillReport.sevOneTrigger.gate === 'verify-tools'
    - MUST observe: drillReport.sevOneTrigger.report.ok === false
    - MUST observe: drillReport.sevOneTrigger.report.toolsPassed === 0
    - MUST observe: drillReport.sevOneTrigger.report.toolsTotal > 0
    - MUST observe: drillReport.sevOneTrigger.declared === true
    - MUST NOT observe: drillReport.sevOneTrigger.report.ok === true
    - MUST NOT observe: drillReport.sevOneTrigger.report.toolsTotal === 0 (empty — the probe actually enumerated the manifest, it did not run against an empty/no-op target)

</details>

#### AC-2

- **GIVEN** a real pre-existing Hono+MCP server is live with the fence armed
- **WHEN** the drill probes POST /api/documents, an MCP store_document call over real /mcp, POST /api/uploads, runJob('task-timeout-worker'), and publishDocumentForRun()
- **THEN** every probe rejects with migration_read_only, and the same five probes succeed when the fence is disarmed (proving the block is real, not a broken endpoint)

`test_tier: integration` · `service: hono` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `soak_with_five_write_surfaces`
    - action: POST /api/documents
    - action: call store_document over real /mcp
    - action: POST /api/uploads
    - action: runJob('task-timeout-worker')
    - action: publishDocumentForRun()
    - MUST observe: probes.app.status === 423
    - MUST observe: probes.app.body.code === 'migration_read_only'
    - MUST observe: probes.mcp.rejected === true
    - MUST observe: probes.upload.status === 423
    - MUST observe: probes.job.ok === false
    - MUST observe: probes.job.error.startsWith('migration_read_only:') === true
    - MUST observe: probes.mission.rejected === true
    - MUST NOT observe: probes.app.status === 200
    - MUST NOT observe: probes.job.ok === true
    - MUST NOT observe: probes.app.status === 0 (empty/unset — every probe actually executed against the live server, none was skipped)
- **Case 1** — start_ref `soak_with_five_write_surfaces`
    - action: disarm the fence via writeDurableMigrationReadOnly('0')
    - action: repeat the same 5 probes
    - MUST observe: probes.app.status === 201
    - MUST observe: probes.job.ok === true
    - MUST observe: probes.mcp.rejected === false
    - MUST NOT observe: probes.app.status === 423
    - MUST NOT observe: probes.app.status === 0 (empty/unset — every probe actually executed against the live disarmed server, none was skipped)

</details>

#### AC-3

- **GIVEN** zero accepted post-export writes and a live pre-existing serving process for acks
- **WHEN** the drill shells out to the real `bun services/platform/src/cli/holo.ts cutover:rollback-repoint --json`
- **THEN** the CLI exits 0 with repointed:true, and the drill's own independent recompute (loading the raw audit file bytes and re-parsing, separate from the code path runRollbackRepoint used internally) equals 0 and matches the report

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `soak_with_five_write_surfaces`
    - action: run `holo cutover:rollback-drill --json --output <path>` which shells the real cutover:rollback-repoint CLI
    - MUST observe: drillReport.repoint.exitCode === 0
    - MUST observe: drillReport.repoint.parsed.repointed === true
    - MUST observe: drillReport.independentRecompute.acceptedCount === 0
    - MUST observe: drillReport.independentRecompute.matchesReport === true
    - MUST observe: drillReport.independentRecompute.rawFileByteCount > 0
    - MUST observe: drillReport.liveAcks.authorizingCount >= 1
    - MUST observe: drillReport.liveAcks.allPreexisting === true
    - MUST NOT observe: drillReport.independentRecompute.acceptedCount !== drillReport.repoint.parsed.precondition.accepted_post_export_writes
    - MUST NOT observe: drillReport.liveAcks.authorizingCount === 0 (empty — the drill actually captured live acknowledgements, it did not stop at a no-op)

</details>

#### AC-4

- **GIVEN** 3 real accepted post-export write records seeded via writePostExportWriteAudit()
- **WHEN** the drill runs against this fixture
- **THEN** rollback is refused with error.code POST_EXPORT_WRITE_ACCEPTED, the independent recompute equals exactly 3 (not merely >0), and the control-plane secrets file is byte-for-byte unchanged

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** stdout (capture required: True)
- **Case 0** — start_ref `post_export_writes_n3`
    - action: run `holo cutover:rollback-drill --json` against the N=3 fixture
    - MUST observe: drillReport.repoint.parsed.ok === false
    - MUST observe: drillReport.repoint.parsed.repointed === false
    - MUST observe: drillReport.repoint.parsed.error.code === 'POST_EXPORT_WRITE_ACCEPTED'
    - MUST observe: drillReport.independentRecompute.acceptedCount === 3
    - MUST observe: drillReport.independentRecompute.matchesReport === true
    - MUST observe: secretsFileSha256Before === secretsFileSha256After
    - MUST NOT observe: drillReport.repoint.parsed.repointed === true
    - MUST NOT observe: drillReport.independentRecompute.acceptedCount === 0

</details>

#### AC-5

- **GIVEN** a pre-existing serving process started BEFORE the drill's control-plane write
- **WHEN** the drill runs the full rollback-repoint end-to-end
- **THEN** report.acknowledgements includes at least one preexisting network_health/process_generation ack from a unit that was NOT the drill's own process, and a fresh post-repoint /health probe against that pre-existing server observes data_plane=convex

`test_tier: integration` · `service: hono` · `flow_ref: T-SYNC-013`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `soak_with_five_write_surfaces`
    - action: start the pre-existing server before running the drill
    - action: run the drill end-to-end
    - action: GET /health on the same pre-existing server after repoint
    - MUST observe: drillReport.liveAcks.acks.some(a => a.kind === 'network_health' && a.preexisting === true) === true
    - MUST observe: drillReport.liveAcks.acks.every(a => a.pid !== drillProcessPid) === true
    - MUST observe: postRepointHealthProbe.body.data_plane === 'convex'
    - MUST NOT observe: drillReport.liveAcks.acks.length === 0

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | drill's sevOneTrigger report is ok:false when verify-tools targets an unreachable base URL | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-1` |
| TC-2 | app mutation write probe returns 423 with code migration_read_only while fenced | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2` |
| TC-3 | MCP mutation tool call is rejected with a MIGRATION_READ_ONLY-prefixed error while fenced | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2` |
| TC-4 | scheduled job run is rejected with a migration_read_only-prefixed error while fenced | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2` |
| TC-5 | the same five write probes succeed when the fence is disarmed | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2-negative` |
| TC-6 | the real cutover:rollback-repoint CLI exits 0 with repointed:true when zero writes are accepted | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3` |
| TC-7 | the drill's independently recomputed accepted-write count equals the repoint report's precondition value | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3` |
| TC-8 | rollback is refused with POST_EXPORT_WRITE_ACCEPTED when 3 accepted post-export writes exist | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4` |
| TC-9 | the independently recomputed accepted-write count equals exactly 3 in the refused case | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4` |
| TC-10 | the control-plane secrets file is unchanged after a refused rollback attempt | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4` |
| TC-11 | at least one authorizing acknowledgement comes from a pre-existing serving process distinct from the drill's own pid | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5` |
| TC-12 | a post-repoint health probe against the pre-existing server observes data_plane convex | AC-5 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5` |

## Fixtures (shared seed data)

- **`soak_with_five_write_surfaces`** — A real Hono+MCP server (createHonoApp) started as a pre-existing OS child process on an ephemeral port before the drill begins, with the soak fence durably armed (HOLO_MIGRATION_READ_ONLY=1), a real export watermark captured, and zero accepted post-export writes in the audit ledger — so the drill can probe all five representative surfaces before attempting rollback.  
  seed_method: `cli`
    - disposable secrets.yaml with HOLO_MIGRATION_READ_ONLY: "1"
    - watermark-report.json with a real exportMs in the past
    - post-export-write-audit.json with accepted_writes: []
    - pre-existing bun child process serving /health, POST /api/documents, /mcp, POST /api/uploads on 127.0.0.1:<ephemeral-port>
- **`broken_verify_tools_target`** — cutover:verify-tools pointed at a bound-then-closed local port, producing a genuine connection-refused failure (toolsPassed=0, ok=false) used as the real declared Sev-1 trigger — never a hand-set ok:false.  
  seed_method: `cli`
    - ephemeral port bound via node:net createServer then closed synchronously
    - HOLO_VERIFY_BASE_URL pointed at that dead port
- **`post_export_writes_n3`** — 3 real accepted post-export write records seeded via writePostExportWriteAudit() — the same operator/fixture ledger entrypoint used by Sprint 29's rollback tests (services/platform/tests/integration/sprint29-rollback-repoint.test.ts) — with committed_at_ms strictly after the export watermark.  
  seed_method: `cli`
    - watermark-report.json with exportMs = now - 60000
    - post-export-write-audit.json with 3 accepted_writes entries, each committed_at_ms = exportMs + 5000/10000/15000, surfaces hono.POST /api/documents / mcp.store_document / mission.publish

## Reading List

- `services/platform/src/cutover/rollback-repoint.ts` — lines 1-827 — the full mechanism being drilled: preconditions, control-plane write, live-ack collection, all error codes
- `services/platform/src/cutover/soak-fence.ts` — lines 3339-3401 — runVerifySoak() / runVerifyTools() — reused as the real Sev-1 trigger source when pointed at a dead base URL
- `services/platform/src/cli/holo.ts` — lines 3384-3436 — the registered cutover:rollback-repoint CLI case this task's drill shells out to as a real child process
- `services/platform/tests/integration/sprint29-rollback-repoint.test.ts` — lines 1-659 — startPreexistingServing(), seedEligibleFixture(), the holo() spawnSync helper — direct precedent for the drill's own test harness
- `services/platform/tests/integration/sprint29-r3-h02-mission-worker-fence.test.ts` — lines 1-80 — armFence()/disarmFence() pattern for the mission-commit and worker write-probe surfaces
- `services/platform/src/mcp/executor.ts` — lines 160-175 — assertMcpWritable(id) — the MCP mutation write-block chokepoint to probe with a real /mcp store_document call
- `services/platform/src/queue/jobs-runner.ts` — lines 1-80 — runJob() and migrationReadOnlyJobError() — the scheduled-job write-block surface (task-timeout-worker is a real registered job name)
- `services/platform/src/mission/document-publish.ts` — lines 1-45 — publishDocumentForRun() — the mission-commit write-block surface
- `services/platform/src/http/hono-app.ts` — lines 929-965 — POST /api/uploads and PUT /api/uploads/:id — the upload write-block surface
- `.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-R3-H03-rollback-requires-preexisting-serving-acks.md` — lines 1-23 — why self-created/in-process acks were rejected — the pattern this task's drill must not repeat
- `.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md` — lines 1-30,159-168 — Sprint 29 Blocked status and the false-green reconciliation risk this drill runs inside of

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/rollback-drill.ts (NEW)`
- `services/platform/src/cli/holo.ts (MODIFY — register cutover:rollback-drill)`
- `services/platform/tests/integration/sprint30-rollback-drill.test.ts (NEW)`
- `.tmp/D07-03/** (evidence)`

**WRITE-PROHIBITED**

- services/platform/src/cutover/rollback-repoint.ts - the drill DRIVES this mechanism as a real CLI child process, it does not modify it (D07-04 owns adding the PONR precondition here)
- convex/** - never modify the live Convex deployment
- operator's real secrets.yaml / production post-export-write audit - every drill run uses disposable fixture paths

## Code Pattern / Design

- **Reference:** .spec/prds/mk6-migration/08-uc-sync.md#UC-SYNC-04
- **Pattern:** Orchestrator that shells the real registered CLI verb end-to-end and independently recomputes its own oracle from raw evidence rather than trusting the child process's self-reported ok field
- **Pattern source:** `services/platform/tests/integration/sprint29-rollback-repoint.test.ts:185-200 (holo() spawnSync helper)`
- **Anti-pattern:** Reading only report.ok/report.repointed and treating that as zero-loss proof; seeding a hand-set Sev-1 flag instead of a real failing gate; probing fewer than all five representative write surfaces

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/rollback-drill.ts services/platform/src/cli/holo.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration-drill | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts` | Exit 0 |

## Agent Assignment

- **Agent:** `devops-engineer`
- **Rationale:** Orchestrating the actual rollback drill on top of the existing rollback-repoint.ts mechanism, with independent zero-loss recomputation and live serving-plane proof, is the same domain and code surface devops-engineer built in Sprint 29 (H-05/R2-C04/R3-H03).

## Coding Standards

- Reuse rollback-repoint.ts exports (loadPostExportWriteAudit, countAcceptedPostExportWrites, writePostExportWriteAudit, filterAuthorizingRollbackAcks) rather than re-implementing audit parsing
- Named exported error-code constants for drill-specific failures, matching the POST_EXPORT_WRITE_ACCEPTED / LIVE_ACK_MISSING precedent

## Dependencies

- **Depends on:** D07-01, D07-02
- **Blocks:** D07-04

## Cross-Specialist Enrichments

### From `convex-planner`

- HARD FINDING — 'the data plane is serving from Convex' is currently unprovable, because nothing in the serving path reads the flag as a routing decision. HOLO_DATA_PLANE has exactly ONE consumer in services/platform/src: resolveObservedDataPlane() called at services/platform/src/http/health.ts:267, whose result is echoed into the /health body at health.ts:293-294. No read handler, MCP tool, or repository branches on it. runRollbackRepoint therefore proves 'a config file changed and /health echoes the new label' — exactly the failure mode D07-03 was told to close. The drill MUST NOT accept /health data_plane:'convex' as evidence of serving; that is a self-referential oracle.
- CONTENT-BOUND CONVEX READ (the real post-repoint oracle). Seed pre-freeze, via the real entrypoint, a document with a known unique title AND a known shareToken, then after the re-point assert BOTH: (1) direct Convex query api.documents.queries.getByTitle({title:'<seeded literal>'}) returns a document whose _id and _creationTime match the values captured pre-freeze (convex/documents/queries.ts:18-29); (2) HTTP GET ${CONVEX_SITE}/article/<shareToken> returns HTTP 200 with Content-Type: text/html and a body containing the seeded title literal (convex/http.ts:14-37 -> api.documents.queries.getByShareToken). The /article/ route is deliberately open under freeze (fencedHttpAction passes GET/HEAD/OPTIONS through, convex/lib/migrationFence.ts:135-151), so it is the one end-to-end HTTP surface that proves Convex is actually serving content, not just answering pings. A 404 from /article/ with the same shareToken is the negative signature.
- SEEDING CONSTRAINT — the seed MUST predate the freeze. Once HOLO_MIGRATION_READ_ONLY=1 is armed, api.documents.mutations.create is wrapped by fencedMutation (convex/lib/migrationFence.ts:107) and throws 'migration_read_only: mutation blocked while HOLO_MIGRATION_READ_ONLY is set'. Seeding the oracle document after freeze is impossible through the fenced path and MUST NOT be worked around via the unfenced migrationFence modules — doing so would both falsify 'frozen' and corrupt the watermark identity D07-02 asserts.
- 'ZERO ACCEPTED POST-EXPORT PRODUCTION WRITES' — WHAT IT MEANS TODAY vs WHAT IT MUST MEAN. Today: countAcceptedPostExportWrites() (rollback-repoint.ts:216-221) filters .tmp/D06-05/post-export-write-audit.json for records with committed_at_ms > export_watermark_ms. That ledger is FAIL-OPEN: loadPostExportWriteAudit() (rollback-repoint.ts:181-211) synthesizes {accepted_writes: []} when the file is ABSENT. The only writers of that file in the repo are writePostExportWriteAudit() (rollback-repoint.ts:226-229) and two Sprint-29 test files (services/platform/tests/integration/sprint29-rollback-repoint.test.ts, sprint29-soak-flip.test.ts). Nothing derives it from real surfaces. So 'zero' is currently proven by a missing file — the exact DEGENERATE_ONLY trap, in production form.
- CONVEX-SIDE ENUMERATION (must be enumerated, not assumed). The Convex surfaces that could still accept a write while 'frozen' are precisely the modules the fence coverage scan EXEMPTS. verifyConvexFenceCoverage() (convex-fence-client.ts:1242-1291) skips lib/migrationFence.ts and everything under migrationFence/ (lines 1254-1256), and those modules import raw mutation from _generated/server (convex/migrationFence/audit.ts:9, convex/migrationFence/drain.ts:19). The complete unfenced public mutation inventory on the frozen deployment is: migrationFence.audit.recordFenceArmed (audit.ts:12-26, inserts migrationFenceAudit), migrationFence.audit.recordWriteAttempt (audit.ts:29-47, inserts migrationFenceAudit), migrationFence.drain.disableAndDrain (drain.ts:213-453, PATCHES real tasks rows to status 'cancelled' and real subscriptionContent rows to researchStatus 'skipped'), migrationFence.drain.probeScheduleConsumer (drain.ts:544-567, no db write), migrationFence.drain.seedInFlightForDrainTest (drain.ts:460-521, INSERTS up to 500 tasks + 500 subscriptionContent + 1 subscriptionSources row). The drill's enumeration step must run holo verify:convex-fence-coverage --json (asserting matches.length===0 and files_scanned>0) AND separately list these five exempt mutations by name with a stated accept/reject disposition. matches:[] alone is a false all-clear because the exemption is invisible in that report.
- MCP/platform side of the same enumeration already exists and should be cited rather than reinvented: mcpMutationToolIds() and assertMcpWritable(toolId) in services/platform/src/cutover/soak-fence.ts enumerate the fenced MCP write tools; MIGRATION_READ_ONLY_BODY is the literal the probes must observe.
- SEV-1 TRIGGER SEQUENCING — the drill must NOT re-arm or re-run runCutoverFreeze() (convex-fence-client.ts:494-607). Re-running it archives the freeze report (archiveFreezeReportIfPresent, convex-fence-client.ts:316-334) and stamps a NEW fence_armed_at, which would break the D07-02 identity binding and insert a fresh migrationFenceAudit row after the export watermark. Freeze is armed once, in Sprint 29; D07-03 reads it, never re-arms it.

**References:**

- `services/platform/src/http/health.ts:12,267,293-294`
- `services/platform/src/cutover/rollback-repoint.ts:181-229`
- `services/platform/src/cutover/rollback-repoint.ts:591-673`
- `services/platform/src/cutover/convex-fence-client.ts:1242-1291`
- `services/platform/src/cutover/convex-fence-client.ts:316-334`
- `services/platform/src/cutover/convex-fence-client.ts:494-607`
- `convex/migrationFence/audit.ts:9,12-47`
- `convex/migrationFence/drain.ts:19,213-453,460-521,544-567`
- `convex/lib/migrationFence.ts:58-64,107-151`
- `convex/documents/queries.ts:18-29`
- `convex/http.ts:14-37`
- `services/platform/tests/integration/sprint29-rollback-repoint.test.ts`
- `services/platform/tests/integration/sprint29-soak-flip.test.ts`

**Gaps (do not plan around these):**

- No routing consumer of HOLO_DATA_PLANE exists — re-pointing changes a label in secrets and a field in /health, nothing else. If UC-SYNC-04 AC-2 means real serving from Convex, that serving path does not exist and D07-03 cannot prove it without building one; the honest alternative is to prove Convex is serveable (direct queries + /article/) and state plainly that platform read routing does not switch.
- The post-export write audit ledger has no producer bound to real write surfaces — only test files and the writePostExportWriteAudit() helper write it, and absence is treated as zero.
- No pre-freeze content oracle (a known document title / shareToken / _creationTime / totalCount) was captured by Sprint 29, so D07-03 depends on such a record existing; if none does, the drill must state that the content-bound oracle is being established retroactively and is therefore weaker.
- verify:convex-fence-coverage structurally cannot see the migrationFence exemption; there is no verb that enumerates unfenced-by-design surfaces.

### From `specialist`

- D07-01's PRIMARY oracle spawns bun services/platform/src/cli/holo.ts cutover:rollback-drill --json. If you register a different verb name, update services/platform/tests/integration/sprint30-rollback-zero-loss.test.ts in the SAME commit; the RED and the verb must never drift.
- The drill report must carry accepted_post_export_writes_recomputed and lost_accepted_writes INDEPENDENTLY recomputed from the raw post-export audit file and from Postgres, not copied from the cutover:rollback-repoint report. Copying the field forward makes the zero-loss claim unfalsifiable.
- IMPORTANT: loadPostExportWriteAudit() (rollback-repoint.ts:181-211) is FAIL-OPEN; a missing audit file yields zero accepted writes. Your drill's zero-loss recompute must therefore assert the audit file EXISTS and is parseable before reporting zero. 'File absent' and 'zero accepted writes' must be distinguishable outcomes in the drill report, never collapsed into a green.
- The drill must call the real runRollbackRepoint() / cutover:rollback-repoint mechanism rather than reimplementing the re-point. Its success oracle is the durable secrets control plane (HOLO_DATA_PLANE=convex read back with loadSecretsFile) plus the /health echo (health.ts:267 -> :293-297), never .tmp/D06-05/data-plane-config.json, which rollback-repoint.ts:120-127 explicitly labels an audit mirror.
- The Sev-1 trigger must be seeded, not simulated by a flag: drive an actual failing gate signal that the drill reads, and record its identity in the drill report so the reviewer can tell a real trigger from a --force.
- The drill must require at least one authorizing acknowledgement with preexisting:true and kind in {network_health, process_generation} (rollback-repoint.ts:260-269). A drill that reports success with zero authorizing acks is reporting a control-plane file write, not a re-point.
- After D07-04 lands, the drill MUST fail closed with POST_PONR_INELIGIBLE if it is run post-PONR. Add that as an explicit drill precondition (a Postgres SELECT against data_plane_ponr) rather than letting the underlying repoint surface it; the drill should refuse to start.
- Run the drill against a disposable secrets path and your own serving child process. Sprint 29 is Blocked at 6de957d3; the drill must not assume, or fixture-substitute, a healthy production soak.

### From `react-native-ui-planner`

- REPRESENTATIVE APP WRITE = chat send. app/(drawer)/chat/[conversationId].tsx:630 issues fetch(`${platformUrl}/api/chat-runs`, ...); the route is app.post('/api/chat-runs', ...) at services/platform/src/http/hono-app.ts:233; the fence is app.use('*', createSoakFenceMiddleware()) at hono-app.ts:192, returning HTTP 423 with body {"error":"migration_read_only","code":"migration_read_only"} (services/platform/src/cutover/soak-fence.ts:58-61 and :317). This is the one app write that is unambiguously fenced today and it is reachable from a Maestro flow via chat-input (app/(drawer)/chat/[conversationId].tsx:1046).
- BLOCKER FOR THE HUMAN GATE — THE APP DOES NOT SHOW THE CODE. app/(drawer)/chat/[conversationId].tsx:984-998 renders the error banner (testID="error-banner") with the hardcoded string 'Failed to send message'. The migration_read_only code IS parsed from the envelope at :643-663 (code: typeof envelope.code === 'string' ? envelope.code : String(response.status)) but never surfaced. The on-screen state after a fenced write is therefore byte-identical to a Wi-Fi drop, so 'visibly blocked with migration_read_only' (UC-SYNC-04 AC-2 / T-SYNC-013) is NOT observable in the UI today. Fix: render the parsed code (e.g. testID="error-banner-code") so Maestro can assertVisible text "migration_read_only". Without that change the banner assert must be paired with a captured 423 body from the same send, but the visible-code fix is the honest one and is a small contained client edit.
- SECOND REPRESENTATIVE APP WRITE (non-chat coverage for AC-2's plural 'representative app ... writes'): document publish, app.post('/api/documents/:id/publish', ...) at hono-app.ts:904, reachable from the document actions sheet (document-actions-button exists at both HEAD and 25414ad1). Same fence, same 423.
- REAL RISK TO THE ZERO-LOSS CLAIM — ZERO MUTATOR PUSHES MAY BYPASS THE FENCE. App-local writes go through app/zero/mutators.ts:48-135 (updateConversation, deleteConversation, softDeleteChatMessage, publishDocument, unpublishDocument, createImportDocument), pushed by ZeroProvider (app/_layout.tsx:198-204) to EXPO_PUBLIC_ZERO_CACHE_URL — a DIFFERENT origin from EXPO_PUBLIC_PLATFORM_URL. I found NO Zero push route in services/platform/src/http/hono-app.ts, so those mutations do not traverse createSoakFenceMiddleware(). If zero-cache accepts pushes during the soak, an ordinary app interaction (rename a conversation, swipe-delete, publish a document) becomes an ACCEPTED post-export production write the fence never saw and countAcceptedPostExportWrites() may never record. The drill MUST attempt a Zero mutator write from the UI during soak and prove it is refused; if it is not refused that is a Sev-1 soak finding, not a test defect.
- POST-REPOINT CLIENT OBLIGATION — the client half of the drill is not 'the app still works', it is 'the app now shows FROZEN PRE-EXPORT state'. After cutover:rollback-repoint writes HOLO_DATA_PLANE=convex and HOLO_ROLLBACK_TARGET=convex-frozen, the operator installs the D07-02 pinned binary and re-runs the D07-02 boot oracle, now asserted against the export-watermark snapshot: visible conversation-row titles must match the frozen Convex snapshot AND any record created in Postgres during the soak window must be ABSENT from the UI. That absence assertion is what makes the rollback observably a rollback rather than a restart.
- SEQUENCING — install the pinned build AFTER the data-plane re-point, and uninstall the HEAD Zero build first (same com.holocron.app bundle id at both revisions; installing over the top leaves ambiguous state). The drill script must run `xcrun simctl uninstall <device> com.holocron.app` before install and re-read CFBundleVersion from the installed bundle to prove which binary is running; otherwise 'fallback works' evidence is indistinguishable from the HEAD build happening to render.
- EVIDENCE SHAPE — Maestro JUnit XML plus screenshots under a run-scoped directory, plus the raw 423 response body and the pre/post CFBundleVersion readback, all referenced from the drill report. Screenshot-only evidence is not sufficient: the empty-list coalescing described in the D07-02 enrichment makes screenshots fakeable.

**References:**

- `app/(drawer)/chat/[conversationId].tsx:630 (POST /api/chat-runs — the representative app write)`
- `app/(drawer)/chat/[conversationId].tsx:643-663 (envelope code parsed but never surfaced)`
- `app/(drawer)/chat/[conversationId].tsx:984-998 (error-banner renders static 'Failed to send message')`
- `app/(drawer)/chat/[conversationId].tsx:1046 (chat-input — Maestro entry point for the write)`
- `services/platform/src/http/hono-app.ts:192 (createSoakFenceMiddleware on '*')`
- `services/platform/src/http/hono-app.ts:233 (POST /api/chat-runs)`
- `services/platform/src/http/hono-app.ts:904 (POST /api/documents/:id/publish — second representative write)`
- `services/platform/src/cutover/soak-fence.ts:58-61,317 (MIGRATION_READ_ONLY_BODY + HTTP 423)`
- `app/zero/mutators.ts:48-135 (Zero mutators — the suspected fence bypass)`
- `app/_layout.tsx:198-204 (ZeroProvider pushes to EXPO_PUBLIC_ZERO_CACHE_URL, a different origin from the fenced Hono app)`
- `app/zero/platform.ts:8,57,87 (platform base URL resolution used by the fenced fetch path)`
- `app.config.cjs:23,45 (com.holocron.app at both revisions — uninstall before install)`

**Gaps (do not plan around these):**

- The app cannot visibly distinguish migration_read_only from any other send failure — error-banner text is hardcoded at app/(drawer)/chat/[conversationId].tsx:987-989. A small client change (render the parsed code) is required before T-SYNC-013's 'visibly blocked' can be honestly asserted at the UI. Flagged rather than silently downgraded to an HTTP-only check.
- Whether Zero mutator pushes traverse the soak fence is UNVERIFIED and no Zero push route exists in services/platform/src/http/hono-app.ts. This is a live threat to the zero-loss guarantee and must be settled inside this drill, not assumed.
- No drill script, evidence directory, or Maestro flow exists for the post-repoint fallback boot. D07-03 depends entirely on D07-02 producing the pinned artifact and the frozen-Convex snapshot, so depends_on: ["D07-02"] should be explicit.
- Nothing today records which app binary produced a given piece of drill evidence; without D07-02's CFBundleVersion stamping every post-repoint client assertion is unattributable.

## Notes

- estimate_minutes 120 is tight given 5 write-surface probes + Sev-1 fault injection + independent recompute + live-ack proof + the N>0 non-degenerate negative case. Sprint 29's R2-C04 (rollback through the serving control plane alone, no drill orchestration) was itself estimated at 150 min. Flagging per stub-preservation rule — estimate left as given.
- Sprint 29 is Blocked (1 CRITICAL, 4 HIGH at 6de957d3) — this drill necessarily runs inside that non-green soak. Every AC here is written to fail closed against that state rather than assume a healthy soak.
- The Sev-1 trigger design deliberately reuses runVerifyTools() pointed at a dead port instead of inventing a new fault-injection surface — this keeps the 'real, declared trigger' requirement grounded in code that already exists and is already exercised by cutover:verify-soak.
- D07-04 (PONR) is expected to add a NEW, stronger precondition to rollback-repoint.ts/the CLI case beyond accepted_post_export_writes>0 — today's mechanism has no PONR awareness at all. This task's AC-3/AC-4 only prove today's accepted-writes precondition; once D07-04 lands, this drill should be re-run/extended to prove a distinct post-PONR refusal (see enrichment for D07-04).

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D07-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "soak_with_five_write_surfaces": {
      "description": "A real Hono+MCP server (createHonoApp) started as a pre-existing OS child process on an ephemeral port before the drill begins, with the soak fence durably armed (HOLO_MIGRATION_READ_ONLY=1), a real export watermark captured, and zero accepted post-export writes in the audit ledger \u2014 so the drill can probe all five representative surfaces before attempting rollback.",
      "seed_method": "cli",
      "records": [
        "disposable secrets.yaml with HOLO_MIGRATION_READ_ONLY: \"1\"",
        "watermark-report.json with a real exportMs in the past",
        "post-export-write-audit.json with accepted_writes: []",
        "pre-existing bun child process serving /health, POST /api/documents, /mcp, POST /api/uploads on 127.0.0.1:<ephemeral-port>"
      ]
    },
    "broken_verify_tools_target": {
      "description": "cutover:verify-tools pointed at a bound-then-closed local port, producing a genuine connection-refused failure (toolsPassed=0, ok=false) used as the real declared Sev-1 trigger \u2014 never a hand-set ok:false.",
      "seed_method": "cli",
      "records": [
        "ephemeral port bound via node:net createServer then closed synchronously",
        "HOLO_VERIFY_BASE_URL pointed at that dead port"
      ]
    },
    "post_export_writes_n3": {
      "description": "3 real accepted post-export write records seeded via writePostExportWriteAudit() \u2014 the same operator/fixture ledger entrypoint used by Sprint 29's rollback tests (services/platform/tests/integration/sprint29-rollback-repoint.test.ts) \u2014 with committed_at_ms strictly after the export watermark.",
      "seed_method": "cli",
      "records": [
        "watermark-report.json with exportMs = now - 60000",
        "post-export-write-audit.json with 3 accepted_writes entries, each committed_at_ms = exportMs + 5000/10000/15000, surfaces hono.POST /api/documents / mcp.store_document / mission.publish"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN an unreachable verify-tools base URL WHEN the drill runs its trigger phase THEN sevOneTrigger carries a real failing report",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-1"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a live fenced server WHEN five representative surfaces are probed THEN all reject with migration_read_only, and succeed when disarmed",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN zero accepted writes WHEN the real rollback-repoint CLI runs THEN it exits 0 repointed:true and the drill's independent recompute matches",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN 3 accepted post-export writes WHEN the drill runs THEN rollback is refused and the recompute equals 3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN a pre-existing serving process WHEN rollback completes THEN a live ack from that process is present and its own /health confirms the switch",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "sevOneTrigger real failure",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "app write blocked",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "MCP write blocked",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "job write blocked",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "disarmed control succeeds",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-2-negative"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "real CLI repointed:true",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "independent recompute matches",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "N=3 refused",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "recompute equals 3",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "secrets unchanged on refusal",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "authorizing ack distinct pid",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "post-repoint health observes convex",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-rollback-drill.test.ts -t AC-5"
    }
  ]
}
-->
