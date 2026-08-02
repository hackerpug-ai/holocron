# D07-02: Keep Convex live + pin the Convex-pointing fallback app build through soak

> **Task ID:** D07-02
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Estimate:** 90 min
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SYNC-04, T-SYNC-012

## Specification

**Objective.** Make UC-SYNC-04 AC-1 provably real for the whole soak window: (1) a standing, tamper-evident attestation that the real Convex deployment stays reachable/un-deleted and that production writes stay blocked on every tick, and (2) an immutable, identity-proven Convex-pointing app build pinned for fallback — proven to actually REACH the Convex cloud deployment, not merely to import the SDK — whose boot path is verified rather than assumed, honestly fail-closed where a full runtime boot proof isn't achievable in the execution environment.

**Success state.** `holo cutover:attest-convex-live` runs a multi-tick window and refuses ok:true unless every tick shows the real Convex deployment reachable AND every tick shows a real write probe rejected with migration_read_only. `holo cutover:pin-fallback-build` records commit 25414ad1b34720c11de12323cc6609309c1023cb (the last revision where app/_layout.tsx builds ConvexReactClient from EXPO_PUBLIC_CONVEX_URL — its child 9b8d1596 repointed the same client to EXPO_PUBLIC_PLATFORM_URL) with a content digest, convex_react_present:true, convex_client_source_env:'EXPO_PUBLIC_CONVEX_URL', and a differential proving current HEAD has neither. The same tool FAILS CLOSED with PIN_DOES_NOT_REACH_CONVEX against fe78fe5a6620a2e0bc7324064e13e53664eca2c1 (imports convex/react but points at EXPO_PUBLIC_PLATFORM_URL) as a required negative-control case. `holo cutover:verify-fallback-boot` either produces a real Maestro cold-boot session log against a build of the 25414ad1 worktree, or fails closed with BOOT_UNVERIFIED — never a bare assertion.

## Critical Constraints

- **MUST** — MUST fail the attestation window's overall ok when ANY single tick fails reachability or write-block — never derive ok from only the final tick
- **MUST** — MUST probe production-write-blocked via a REAL HTTP write attempt (POST /api/documents) against a pre-existing serving process, in addition to reading isMigrationReadOnly() — an env read alone is not proof a live server enforces the fence
- **MUST** — MUST record the pinned commit SHA from BOTH real differential grep evidence AND a runtime-source discriminator: convex/react imported in app/_layout.tsx AND ConvexReactClient constructed from process.env.EXPO_PUBLIC_CONVEX_URL (never EXPO_PUBLIC_PLATFORM_URL) — an import-only check is insufficient, since a later commit can still import convex/react while the client actually talks to Hono, not Convex (verified during planning: commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 imports convex/react but builds ConvexReactClient from EXPO_PUBLIC_PLATFORM_URL — it was the original mis-pin candidate and is now a required negative-control fixture, not the pin)
- **MUST** — MUST hash-chain the durable attestation evidence file (each record's prev_hash = sha256 of the previous record) so tampering/deletion breaks verification, not just append-and-trust
- **NEVER** — NEVER use in-process createHonoApp() as the write-probe target for the continuous write-block check (R3-H03 precedent: self-created handlers must never authorize evidence) — probe a pre-existing OS process via resolveVerifyBaseUrl()
- **NEVER** — NEVER report boot:true for the pinned fallback build without a real Maestro session log tied to that build's content digest — a missing simulator/device MUST fail closed (BOOT_UNVERIFIED), never skip-and-pass
- **NEVER** — NEVER accept a pin candidate whose ConvexReactClient is constructed from EXPO_PUBLIC_PLATFORM_URL (or any non-Convex source) — cutover:pin-fallback-build MUST fail closed with PIN_DOES_NOT_REACH_CONVEX rather than record a build that cannot reach frozen Convex, even if convex/react is present
- **NEVER** — NEVER delete, modify, or write to the convex/ directory or the live Convex deployment — this task only observes and attests, it does not touch Sprint 29's freeze/fence
- **STRICTLY** — STRICTLY isolate the pinned-build worktree/build artifacts under .tmp/D07-02/ — never let the pinned pre-rewrite checkout overwrite files in the live working tree

## Acceptance Criteria

#### AC-1 (PRIMARY)

- **GIVEN** the real Convex deployment configured via CONVEX_URL is reachable and migrationFence.audit is deployed
- **WHEN** the operator runs `cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json`
- **THEN** the report is ok:true only when every one of the 3 ticks independently observed a real, successful Convex query response, and the durable evidence file hash-chains all 3 records

`test_tier: integration` · `service: convex` · `flow_ref: T-SYNC-012`

**Verify:** `bun services/platform/src/cli/holo.ts cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json --output .tmp/D07-02/attestation-report.json`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** file_artifact (capture required: True)
- **Case 0** — start_ref `real_convex_deployment`
    - action: run `holo cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json --output .tmp/D07-02/attestation-report.json`
    - MUST observe: report.ok === true
    - MUST observe: report.ticks.length === 3
    - MUST observe: every tick.reachable === true
    - MUST observe: .tmp/D07-02/convex-live-attestation.jsonl has exactly 3 lines
    - MUST observe: tick[2].prev_hash === sha256(canonical(tick[1]))
    - MUST NOT observe: report.ticks.length === 0
    - MUST NOT observe: any tick.reachable === false
- **Case 1** — start_ref `unreachable_convex_target`
    - action: run `holo cutover:attest-convex-live --ticks 2 --interval-ms 500 --json` with EXPO_PUBLIC_CONVEX_URL pointed at the closed port
    - MUST observe: report.ok === false
    - MUST observe: report.error.code === 'CONVEX_UNREACHABLE'
    - MUST observe: tick[0].reachable === false
    - MUST NOT observe: report.ok === true
    - MUST NOT observe: report.ticks.length === 0 (empty — failure still records concrete probe attempts, not a silent no-op)

</details>

#### AC-2

- **GIVEN** a real pre-existing Hono server is listening with the soak fence durably armed
- **WHEN** the attestation window runs 3 ticks, each issuing a real POST /api/documents against the pre-existing server
- **THEN** every tick reports writes_blocked with a concrete 423 + migration_read_only body, and a mid-window disarm is caught (not silently passed)

`test_tier: integration` · `service: hono` · `flow_ref: T-SYNC-012`

**Verify:** `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** api_response (capture required: True)
- **Case 0** — start_ref `armed_soak_with_live_hono`
    - action: run a 3-tick attestation window
    - action: each tick issues POST /api/documents against the pre-existing baseUrl
    - MUST observe: every tick.writes_blocked === true
    - MUST observe: every tick.write_probe_status === 423
    - MUST observe: every tick.write_probe_body.code === 'migration_read_only'
    - MUST NOT observe: any tick.write_probe_status === 200
    - MUST NOT observe: any tick.write_probe_status === 201
    - MUST NOT observe: report.ticks.length === 0 (empty — probes actually ran, not a no-op)
- **Case 1** — start_ref `armed_soak_with_live_hono`
    - action: run tick 1 normally
    - action: before tick 2, call writeDurableMigrationReadOnly('0') against the same secrets path the live server reads
    - action: run tick 2 and tick 3
    - MUST observe: report.ok === false
    - MUST observe: report.error.code === 'WRITES_NOT_BLOCKED'
    - MUST observe: tick[1].writes_blocked === false
    - MUST observe: tick[1].write_probe_status === 201
    - MUST NOT observe: report.ok === true
    - MUST NOT observe: report.ticks.length === 0 (empty — the disarm is caught mid-run, not by an empty/no-op window)

</details>

#### AC-3

- **GIVEN** commit 25414ad1b34720c11de12323cc6609309c1023cb builds ConvexReactClient from EXPO_PUBLIC_CONVEX_URL, its downstream commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 still imports convex/react but builds the client from EXPO_PUBLIC_PLATFORM_URL instead, and current HEAD has zero convex/react imports at all
- **WHEN** the operator runs `cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json` and, separately, against the known-wrong fe78fe5a6620a2e0bc7324064e13e53664eca2c1 candidate
- **THEN** the manifest for 25414ad1 records the commit SHA, a build content digest, convex_react_present:true, convex_client_source_env:'EXPO_PUBLIC_CONVEX_URL', reaches_convex:true, and both sides of the HEAD differential — while the same tool run against fe78fe5a REFUSES with reaches_convex:false and error.code PIN_DOES_NOT_REACH_CONVEX despite convex_react_present:true

`test_tier: integration` · `service: cli` · `flow_ref: T-SYNC-012`

**Verify:** `bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json --output .tmp/D07-02/pinned-fallback-build-manifest.json`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** file_artifact (capture required: True)
- **Case 0** — start_ref `pinned_pre_rewrite_commit`
    - action: run `holo cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json`
    - action: run `holo verify:no-convex-client --json` at HEAD for the differential
    - MUST observe: manifest.commit_sha === '25414ad1b34720c11de12323cc6609309c1023cb'
    - MUST observe: manifest.convex_react_present_at_commit === true
    - MUST observe: manifest.convex_client_source_env === 'EXPO_PUBLIC_CONVEX_URL'
    - MUST observe: manifest.reaches_convex === true
    - MUST observe: manifest.convex_react_present_at_head === false
    - MUST observe: manifest.build_digest_sha256 matches /^[0-9a-f]{64}$/
    - MUST NOT observe: manifest.commit_sha === HEAD_sha
    - MUST NOT observe: manifest.convex_client_source_env === 'EXPO_PUBLIC_PLATFORM_URL'
    - MUST NOT observe: manifest.build_digest_sha256 === '' (empty — build artifact must actually be produced, not a placeholder)
- **Case 1** — start_ref `platform_pointing_convex_react_commit`
    - action: run `holo cutover:pin-fallback-build --commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 --json` against the known-wrong candidate
    - MUST observe: manifest.convex_react_present_at_commit === true
    - MUST observe: manifest.convex_client_source_env === 'EXPO_PUBLIC_PLATFORM_URL'
    - MUST observe: manifest.reaches_convex === false
    - MUST observe: manifest.ok === false
    - MUST observe: manifest.error.code === 'PIN_DOES_NOT_REACH_CONVEX'
    - MUST NOT observe: manifest.reaches_convex === true
    - MUST NOT observe: manifest.ok === true
    - MUST NOT observe: manifest.convex_client_source_env === '' (empty — the discriminator must be positively read, not defaulted/unset, even on refusal)

</details>

#### AC-4

- **GIVEN** the pinned fallback build manifest for commit 25414ad1b34720c11de12323cc6609309c1023cb from AC-3 exists with reaches_convex:true
- **WHEN** the operator runs `cutover:verify-fallback-boot --json`
- **THEN** EITHER a real Maestro cold-boot session log against a simulator/device build of the 25414ad1 worktree proves boot, OR (when no simulator/device is available) the command fails closed with BOOT_UNVERIFIED and a non-zero exit — never ok:true without the session log

`test_tier: e2e` · `service: cli` · `flow_ref: T-SYNC-012`

**Verify:** `bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json --output .tmp/D07-02/fallback-boot-report.json`

<details><summary>Scenario (start→end proof · topology: single-node)</summary>

- **Negative control:** would fail if disconnect, stub, empty, mock, static
- **Evidence:** file_artifact (capture required: True)
- **Case 0** — start_ref `pinned_pre_rewrite_commit`
    - action: build the 25414ad1 worktree for the iOS simulator (expo prebuild + run:ios)
    - action: run .e2e/maestro/gate/step-1-cold-boot.yaml against the booted simulator
    - action: run `holo cutover:verify-fallback-boot --json`
    - MUST observe: boot_report.ok === true
    - MUST observe: boot_report.boot_evidence.artifact_type === 'maestro_session_log'
    - MUST observe: boot_report.simulator_udid matches /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/ (real simulator UDID format)
    - MUST observe: boot_report.build_digest_sha256 === manifest.build_digest_sha256
    - MUST observe: boot_report.commit_sha === '25414ad1b34720c11de12323cc6609309c1023cb'
    - MUST NOT observe: boot_report.ok === true with boot_report.boot_evidence.session_log_path == null
    - MUST NOT observe: boot_report.simulator_udid === '' (empty — no simulator was ever actually launched)
- **Case 1** — start_ref `pinned_pre_rewrite_commit`
    - action: run `holo cutover:verify-fallback-boot --json` with HOLO_DISABLE_SIMULATOR=1 (no device/simulator resolvable)
    - MUST observe: boot_report.ok === false
    - MUST observe: boot_report.error.code === 'BOOT_UNVERIFIED'
    - MUST observe: process exit code !== 0
    - MUST NOT observe: boot_report.ok === true
    - MUST NOT observe: boot_report.error.code === '' (empty — the fail-closed path must carry a concrete error code, not a silent unlabeled failure)

</details>

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | attest-convex-live report is ok:true when all 3 ticks observe a real Convex query response | AC-1 | `bun services/platform/src/cli/holo.ts cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json` |
| TC-2 | attest-convex-live report is ok:false when the configured Convex target is unreachable | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-1-negative` |
| TC-3 | the durable attestation evidence file hash-chains every recorded tick | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t hash-chain` |
| TC-4 | every attestation tick's write probe returns 423 with code migration_read_only while the fence is armed | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2` |
| TC-5 | attestation report is ok:false when the fence is disarmed mid-window | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2-negative` |
| TC-6 | pin-fallback-build manifest records commit 25414ad1b34720c11de12323cc6609309c1023cb with convex_react_present_at_commit true and convex_client_source_env EXPO_PUBLIC_CONVEX_URL | AC-3 | `bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json` |
| TC-7 | pin-fallback-build manifest records convex_react_present_at_head false at current HEAD | AC-3 | `bun services/platform/src/cli/holo.ts verify:no-convex-client --json` |
| TC-8 | verify-fallback-boot reports ok:true only with a real Maestro session log artifact present | AC-4 | `bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json` |
| TC-9 | verify-fallback-boot fails closed with BOOT_UNVERIFIED when no simulator or device is available | AC-4 | `HOLO_DISABLE_SIMULATOR=1 bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json` |
| TC-10 | pin-fallback-build refuses commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 with error code PIN_DOES_NOT_REACH_CONVEX because its ConvexReactClient is sourced from EXPO_PUBLIC_PLATFORM_URL | AC-3 | `bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 --json` |

## Fixtures (shared seed data)

- **`real_convex_deployment`** — The actual dev/staging Convex deployment configured via EXPO_PUBLIC_CONVEX_URL/CONVEX_URL, already holding the migrationFence.audit functions deployed by Sprint 29 D06-03. Pre-existing external deployment — this task only observes/probes it, never seeds it.  
  seed_method: `recorded_external`
    - Convex deployment reachable at CONVEX_URL with migrationFence.audit.latestFenceArmed query registered
    - convex/ directory present in the repo (not deleted)
- **`unreachable_convex_target`** — EXPO_PUBLIC_CONVEX_URL pointed at a local port that is bound then immediately closed before the probe runs, proving the reachability check can genuinely observe a failure rather than always returning true.  
  seed_method: `cli`
    - ephemeral port bound via node:net createServer then closed synchronously before cutover:attest-convex-live runs
- **`armed_soak_with_live_hono`** — A real Hono server (createHonoApp) started as a pre-existing OS child process listening on an ephemeral port BEFORE the attestation window begins (never in-process createHonoApp), with HOLO_MIGRATION_READ_ONLY durably armed via writeDurableMigrationReadOnly('1') against a disposable secrets.yaml.  
  seed_method: `cli`
    - disposable secrets.yaml with HOLO_MIGRATION_READ_ONLY: "1"
    - pre-existing bun child process serving /health and POST /api/documents on 127.0.0.1:<ephemeral-port>
- **`pinned_pre_rewrite_commit`** — Git commit 25414ad1b34720c11de12323cc6609309c1023cb (chore(D01-01): mark AC checkboxes completed after land — the direct parent of 9b8d1596) checked out into an isolated git worktree. Verified during planning via `git show 25414ad1:app/_layout.tsx`: line 5 imports ConvexProvider/ConvexReactClient from 'convex/react'; line 19 reads `const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;`; line 25 builds `new ConvexReactClient(convexUrl ?? 'https://placeholder.convex.cloud')`; lines 125/145 wrap the tree in <ConvexProvider>. This is the last revision that both imports convex/react AND actually points the client at the Convex cloud deployment — its child 9b8d1596 (D01-04, 'Convex env alias removal') repointed the same construction to `new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111')` sourced from EXPO_PUBLIC_PLATFORM_URL (Hono), not Convex. CORRECTION FROM PLANNING: an earlier draft of this task pinned fe78fe5a6620a2e0bc7324064e13e53664eca2c1 on convex/react-import evidence alone; that commit is downstream of the 9b8d1596 repoint and therefore ALSO points at EXPO_PUBLIC_PLATFORM_URL — a build from it imports the SDK but cannot reach frozen Convex, which would have made the boot AC (AC-4) vacuous. Caught by react-native-ui-planner and independently re-verified here via `git show <sha>:app/_layout.tsx` at both SHAs before correcting.  
  seed_method: `cli`
    - git worktree add .tmp/D07-02/pinned-fallback-worktree 25414ad1b34720c11de12323cc6609309c1023cb
    - app/_layout.tsx:5 imports ConvexProvider/ConvexReactClient from 'convex/react' at this SHA
    - app/_layout.tsx:19,25 build the client from process.env.EXPO_PUBLIC_CONVEX_URL at this SHA
    - app/_layout.tsx:125,145 wrap the tree in <ConvexProvider> at this SHA
- **`platform_pointing_convex_react_commit`** — Git commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 — imports convex/react (it is the last commit before 5fe0663d removed the final such imports from components/hooks/screens) but is downstream of the 9b8d1596 repoint, so its app/_layout.tsx:28 constructs ConvexReactClient from EXPO_PUBLIC_PLATFORM_URL, not EXPO_PUBLIC_CONVEX_URL — it talks to Hono, not Convex. Used ONLY as a required negative-control comparand proving cutover:pin-fallback-build's reaches-Convex discriminator actually discriminates (this is the exact SHA a naive import-only check would have wrongly accepted during planning) — it must never be recorded as the pin.  
  seed_method: `cli`
    - git show fe78fe5a6620a2e0bc7324064e13e53664eca2c1:app/_layout.tsx | grep ConvexReactClient → new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111')
    - platformUrl at this SHA is sourced from process.env.EXPO_PUBLIC_PLATFORM_URL, not EXPO_PUBLIC_CONVEX_URL

## Reading List

- `services/platform/src/cutover/convex-fence-client.ts` — lines 237-252 — convexUrl() / createCutoverConvexClient() — the exact client surface to reuse for the reachability probe
- `services/platform/src/cutover/soak-fence.ts` — lines 51-137 — MIGRATION_READ_ONLY_ENV, isMigrationReadOnly(), writeDurableMigrationReadOnly() for the write-block check
- `services/platform/src/cutover/soak-fence.ts` — lines 1279-1299 — resolveVerifyBaseUrl() — how existing cutover verbs resolve a live serving base URL
- `services/platform/src/cutover/rollback-repoint.ts` — lines 283-324 — probePreexistingServingListening() pattern — real network probe against an already-listening process, the model for the write-probe target
- `services/platform/tests/integration/sprint29-rollback-repoint.test.ts` — lines 77-176 — startPreexistingServing() helper — spawn a real pre-existing bun server the test starts BEFORE the command under test, reuse this pattern rather than in-process createHonoApp
- `services/platform/src/http/hono-app.ts` — lines 191,350 — createSoakFenceMiddleware() mount point and POST /api/documents — the real write surface to probe
- `services/platform/src/cli/commands/verify-no-convex-client.ts` — lines 1-22 — DEFAULT_NO_CONVEX_CLIENT_ROOTS and the real grep this task reuses to prove HEAD has zero convex/react imports
- `services/platform/src/cli/holo.ts` — lines 3576-3609 — registered verify:no-convex-client case — the pattern for registering the three new cutover:* verbs this task adds
- `app/_layout.tsx` — lines 1-30,120-150 — the exact reaches-Convex discriminator: at commit 25414ad1b34720c11de12323cc6609309c1023cb ConvexReactClient is built from process.env.EXPO_PUBLIC_CONVEX_URL (reaches Convex); at its child 9b8d1596 and all descendants including fe78fe5a6620a2e0bc7324064e13e53664eca2c1 it is repointed to process.env.EXPO_PUBLIC_PLATFORM_URL (reaches Hono, not Convex) — convex/react import presence alone does NOT distinguish these
- `.e2e/maestro/gate/step-1-cold-boot.yaml` — lines 1-40 — the existing real cold-boot Maestro flow this task reuses for the pinned build's boot proof
- `.spec/prds/mk6-migration/08-uc-sync.md` — lines 56-64 — UC-SYNC-04 AC-1 verbatim requirement text

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/convex-live-attestation.ts (NEW)`
- `services/platform/src/cutover/pinned-fallback-build.ts (NEW)`
- `services/platform/src/cli/holo.ts (MODIFY — register cutover:attest-convex-live, cutover:pin-fallback-build, cutover:verify-fallback-boot)`
- `services/platform/tests/integration/sprint30-convex-live-attestation.test.ts (NEW)`
- `services/platform/tests/integration/sprint30-pinned-fallback-build.test.ts (NEW)`
- `.tmp/D07-02/** (evidence, worktree, build artifacts)`

**WRITE-PROHIBITED**

- convex/** - this task attests to the live deployment, it never modifies or deletes it
- services/platform/src/cutover/rollback-repoint.ts, soak-fence.ts - read-only reuse; D07-03 owns changes to the rollback mechanism itself
- app/, components/, hooks/, screens/ at HEAD - the pinned build is checked out into an isolated .tmp/ worktree, never applied to the live working tree

## Code Pattern / Design

- **Reference:** .spec/prds/mk6-migration/08-uc-sync.md#UC-SYNC-04
- **Pattern:** Multi-tick fail-closed attestation window with hash-chained evidence, reusing the R3-H03 pre-existing-serving-process pattern for any live network probe; pin-fallback-build discriminates on runtime client-source, not just import presence
- **Pattern source:** `services/platform/src/cutover/rollback-repoint.ts:283-341 (collectLiveDataPlaneAcknowledgements / R3-H03)`
- **Anti-pattern:** Reporting ok:true from a single latest-tick check, from an in-process createHonoApp() self-probe, from asserting boot:true without a captured device session log, or from an import-only convex/react check that would accept a commit whose client actually points at Hono (fe78fe5a)

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/cutover/convex-live-attestation.ts services/platform/src/cutover/pinned-fallback-build.ts services/platform/src/cli/holo.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration-attestation | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts` | Exit 0 |
| integration-pinned-build | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-pinned-fallback-build.test.ts` | Exit 0 |

## Agent Assignment

- **Agent:** `devops-engineer`
- **Rationale:** Standing Convex reachability attestation, durable evidence chaining, and a real pinned-build/boot pipeline are cutover infrastructure work squarely in devops-engineer's rollback/escape-hatch domain, matching who owns rollback-repoint.ts and soak-fence.ts from Sprint 29.

## Coding Standards

- Reuse existing cutover module exports rather than re-implementing (createCutoverConvexClient, resolveVerifyBaseUrl, writeDurableMigrationReadOnly)
- Fail-closed error codes as named exported constants, matching POST_EXPORT_WRITE_ACCEPTED-style precedent in rollback-repoint.ts

## Dependencies

- **Depends on:** D07-01
- **Blocks:** D07-03

## Cross-Specialist Enrichments

### From `convex-planner`

- HARD FINDING — the rollback mechanism never contacts Convex. runRollbackRepoint() (rollback-repoint.ts:456-790) writes HOLO_DATA_PLANE=convex + HOLO_ROLLBACK_TARGET to durable secrets and collects acks from an already-listening Hono /health. It issues ZERO Convex queries. TARGET_CONVEX_FROZEN='convex-frozen' (rollback-repoint.ts:46) is a LABEL STRING, not a deployment URL, and resolveRollbackBaseUrl() (rollback-repoint.ts:241-243) resolves the platform Hono base URL, not Convex. Today a rollback would report ok:true against a DELETED Convex deployment. D07-02 must add a Convex reachability+identity attestation; it cannot assume rollback-repoint provides one.
- REACHABILITY PROBE (real existing surfaces only). Client: createCutoverConvexClient() (convex-fence-client.ts:250-252) over convexUrl() (convex-fence-client.ts:237-248, env EXPO_PUBLIC_CONVEX_URL | VITE_CONVEX_HTTP_URL | CONVEX_URL). Probe set, all read-only: (a) api.documents.queries.count -> number (convex/documents/queries.ts:78-87); (b) api.documents.queries.list({limit:1}) -> {documents:[{_id,_creationTime,...}], metadata:{totalCount,hasMore}} (convex/documents/queries.ts:36-72); (c) api.migrationFence.audit.latestFenceArmed -> {fenceArmedAtMs, reason, atMs, _id}|null (convex/migrationFence/audit.ts:50-67); (d) api.migrationFence.audit.countAttemptsInWindow({sinceMs}) -> {acceptedWriteCount, rejectedWriteCount, total, sinceMs, untilMs} (audit.ts:70-96); (e) api.migrationFence.drain.latestDrain -> {drainCompletedAtMs, surfaces, consumersHonored, _id}|null (drain.ts:570-604); (f) api.migrationFence.drain.scheduleDisableStatus -> {env, envValue, disabled, consumers} (drain.ts:524-538); (g) HTTP GET ${CONVEX_SITE}/article/<shareToken> -> 200 text/html (convex/http.ts:14-37, kept open by fencedHttpAction GET passthrough at convex/lib/migrationFence.ts:135-151); (h) getMigrationReadOnlyEnv() -> '1' via npx convex env get (convex-fence-client.ts:280-294 / 255-278).
- UN-DELETED vs RE-INITIALIZED — the discriminator is (c)+(e). A re-created/empty deployment returns latestFenceArmed===null and latestDrain===null because migrationFenceAudit (convex/schema.ts:1521-1536) would be empty. Reachability alone (a 200 from any Convex URL) proves NOTHING. The attestation MUST assert latestFenceArmed._id is a non-null Convex document id AND latestFenceArmed.fenceArmedAtMs equals fence_armed_at in .tmp/D06-03/freeze-report.json (produced by runCutoverFreeze, convex-fence-client.ts:592-606) AND latestDrain.drainCompletedAtMs equals drainCompletedAtMs in .tmp/D06-03/quiet-check-report.json.
- IDENTITY-vs-WATERMARK (the silent-divergence kill). ExportWatermark (export-watermark.ts:24-38) carries only watermarkAt/watermarkAtMs, lastWriteAuditCount, fence_armed_at, fence_env, quiet_check_path, quiet_ok — there is NO content digest of Convex state, and loadExportWatermarkMs() (rollback-repoint.ts:150-174) reads only the timestamp. Bind identity with two live Convex reads: (1) DIVERGENCE-BY-TIME — documents.queries.list({limit:1}) newest _creationTime MUST be <= watermarkAtMs; any newer row means Convex accepted a write after the export and the frozen state is no longer the export's twin. (2) DIVERGENCE-BY-AUDIT — countAttemptsInWindow({sinceMs: watermarkAtMs}) MUST return acceptedWriteCount===0 while rejectedWriteCount>0 (the rejected probes are the non-degenerate positive half of the oracle).
- CAUTION on the cheapest oracle: documents.queries.count (convex/documents/queries.ts:78-87) reads the DENORMALIZED documentCounters row named 'total', not a live row count. A divergence that bypassed counter maintenance would leave count unchanged. Never use count alone as the identity oracle — always pair it with the newest-_creationTime assertion from list({limit:1}).
- FALLBACK READ PATH — real modules a Convex-serving app would traverse: convex/documents/queries.ts (get/getByTitle/list/count/countWithFilter/countByCategory/getByShareToken), convex/documents/search.ts, convex/conversations/queries.ts, convex/chatMessages/queries.ts, convex/subscriptions/*, convex/notifications/queries.ts, convex/research/queries.ts, convex/http.ts for /article/, convex/schema.ts for table shape. All read paths are query builders and are NOT fenced (only mutation/action/httpAction are swapped — FENCED_IMPORT_NAMES, convex/lib/migrationFence.ts:154-170), so reads keep working while HOLO_MIGRATION_READ_ONLY=1. The attestation should traverse at least documents + one relational table so an empty-but-reachable deployment cannot pass.
- PINNED FALLBACK BUILD — BLOCKING GAP, do not plan around it. app/_layout.tsx:5,31,198-221 mounts ZeroProvider ONLY; the comment at app/_layout.tsx:31 explicitly records 'cold-boot uses ZeroProvider only (no legacy data-plane client)' and app/_layout.tsx:194 notes the Convex-backed notification provider was removed. holo verify:no-convex-client (services/platform/src/cli/commands/verify-no-convex-client.ts:4,61-64) fails on any convex/react import under app/, components/, hooks/, screens/. A Convex-pointing app build CANNOT be produced from the planning SHA. The pin must be an artifact-level pin (a pre-removal git SHA plus a stored, already-built binary/bundle), and the AC must assert boot of that stored artifact — never expo build from HEAD.
- ENV CONFLICT — flag to the operator, do not silently resolve. verifyNoConvexEnv() (services/platform/src/config/verify-no-convex-env.ts:15-19,44,69-75) bans the literals CONVEX_URL / EXPO_PUBLIC_CONVEX_URL / CONVEX_DEPLOY_KEY across app/, holocron-mcp/, services/platform/, scanning with --hidden --no-ignore so gitignored .env files are included. The exclusion globs (verify-no-convex-env.ts:36-42) do NOT exclude src/cutover. convex-fence-client.ts:239,245,375,419-420 contains those literals verbatim. So the module that keeps Convex reachable for rollback is itself a T-PLAT-017 gate hit. D07-02 must state which gate wins during the soak window rather than assume both pass.

**References:**

- `services/platform/src/cutover/rollback-repoint.ts:39-46`
- `services/platform/src/cutover/rollback-repoint.ts:150-174`
- `services/platform/src/cutover/rollback-repoint.ts:241-243`
- `services/platform/src/cutover/rollback-repoint.ts:456-790`
- `services/platform/src/cutover/convex-fence-client.ts:237-252`
- `services/platform/src/cutover/convex-fence-client.ts:255-298`
- `services/platform/src/cutover/convex-fence-client.ts:592-606`
- `services/platform/src/cutover/export-watermark.ts:24-38`
- `convex/migrationFence/audit.ts:50-96`
- `convex/migrationFence/drain.ts:524-538`
- `convex/migrationFence/drain.ts:570-604`
- `convex/documents/queries.ts:36-87`
- `convex/http.ts:14-37`
- `convex/lib/migrationFence.ts:135-170`
- `convex/schema.ts:1521-1536`
- `app/_layout.tsx:5,31,194,198-221`
- `services/platform/src/cli/commands/verify-no-convex-client.ts:4,61-64`
- `services/platform/src/config/verify-no-convex-env.ts:15-19,36-44`

**Gaps (do not plan around these):**

- No Convex reachability, liveness, or un-deleted attestation exists anywhere in services/platform/src — runRollbackRepoint performs zero Convex I/O.
- No content digest / row-count manifest of the frozen Convex state is captured at export time; ExportWatermark (export-watermark.ts:24-38) is timestamps + fence metadata only. Identity must be reconstructed from live reads, and the pre-freeze documents.count totalCount must be recorded by D07-02 because nothing records it today.
- No pinned Convex-pointing app build artifact exists and none can be built from the planning SHA (app/_layout.tsx has no ConvexProvider; verify:no-convex-client enforces its absence).
- verify-no-convex-env (T-PLAT-017) and the Convex URL literals in services/platform/src/cutover/convex-fence-client.ts are in direct conflict; nothing reconciles them for the soak window.
- No CLI verb exists for a Convex-live attestation; holo cutover:* has no verb that reads Convex state.

### From `specialist`

- The Convex-live attestation must be a NETWORK observation against the real Convex deployment (reuse services/platform/src/cutover/convex-fence-client.ts, which already talks to real Convex), not a config assertion. A test that passes with Convex deleted is not an attestation. Note that runRollbackRepoint() performs ZERO Convex I/O, so if nothing else in this sprint touches Convex, the 'Convex is still alive' claim rests entirely on D07-02's attestation plus D07-04's PONR snapshot.
- D07-04 now embeds a live Convex escape-hatch snapshot in the PONR row (convex_fence_audit_id, convex_fence_env_value, convex_documents_total, convex_newest_document_creation_time, convex_accepted_writes_since_watermark, convex_rejected_writes_since_watermark, export_watermark_ms). Align your attestation's field names and units with those so the two artifacts are directly comparable by an auditor.
- The pinned fallback app build must be content-addressed: record the build artifact's sha256 plus the Convex deployment URL it was compiled against, so D07-03's drill can assert the build it boots is the build that was pinned. A path or a tag alone is forgeable.
- Publish the attestation artifact path and JSON shape explicitly (suggest .tmp/D07-02/convex-live-attestation.json); D07-03's drill reads it as a precondition and should not have to guess.
- The attestation must record the pre-existing serving base URL and pid that D07-03/D07-04 rely on for authorizing acknowledgements (rollback-repoint.ts:260-269 rejects cutover-cli, hono-serving-health, and any createHonoApp source). Anything self-created in the same command will never authorize repointed:true.
- The only network-observable evidence that a re-point took effect is the /health body via resolveObservedDataPlane() (health.ts:267 -> :293-297). If your attestation asserts data-plane identity, read it there, not from a .tmp mirror.
- Do not lift HOLO_MIGRATION_READ_ONLY for any part of D07-02. The fence stays armed through the whole soak; only D07-04's cutover:enable-writes lifts it, and doing so passes the point of no return.

### From `react-native-ui-planner`

- AGREED WITH convex-planner AND devops-engineer ON THE SHAPE: the fallback build is necessarily an ARCHIVED ARTIFACT from a pinned pre-removal SHA and can never be built from HEAD. HEAD app/_layout.tsx:31 records 'S-COLDBOOT-01 / CAP-CUT-01: cold-boot uses ZeroProvider only (no legacy data-plane client)' and mounts ZeroProvider at :198-221; `holo verify:no-convex-client` (services/platform/src/cli/commands/verify-no-convex-client.ts:12, DEFAULT_NO_CONVEX_CLIENT_ROOTS = app, components, hooks, screens) fails closed on any convex/react import in those roots.
- REFINEMENT THAT CHANGES WHICH SHA GETS ARCHIVED — fe78fe5a is the last revision with convex/react IMPORTS, but it is NOT a Convex-cloud-pointing build. Two different questions are being conflated: (a) which revision still imports convex/react, (b) which revision actually points a Convex client at the Convex cloud deployment. For AC-1's 'Convex-pointing app build pinned for fallback' only (b) matters. Verified: commit 9b8d1596 ('feat(D01-04): consolidated secrets source + Convex env alias removal') repointed the root client from EXPO_PUBLIC_CONVEX_URL to EXPO_PUBLIC_PLATFORM_URL — at 9b8d1596 app/_layout.tsx:28 reads `new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111')`. Every revision from 9b8d1596 forward (including fe78fe5a) still imports convex/react but talks to the Hono platform, not to Convex cloud. Archiving fe78fe5a would produce a build that CANNOT reach frozen Convex and the boot proof would be meaningless.
- THE CORRECT PIN IS 25414ad1b34720c11de12323cc6609309c1023cb (2026-07-15, 'chore(D01-01): mark AC checkboxes completed after land') — the parent of 9b8d1596 and the LAST revision where app/_layout.tsx constructs `new ConvexReactClient(convexUrl ?? 'https://placeholder.convex.cloud')` from `process.env.EXPO_PUBLIC_CONVEX_URL` and wraps the tree in <ConvexProvider> (lines 5, 19-21, 25, 125, 145 at that SHA). Verify with: git show 25414ad1:app/_layout.tsx | grep -n 'ConvexReactClient\|EXPO_PUBLIC_CONVEX_URL\|ConvexProvider'. If devops-engineer prefers fe78fe5a for import-coverage reasons, both can be archived, but the BOOT PROOF must run against 25414ad1 and the manifest must record which SHA the proof used.
- REWRITE BOUNDARY FOR THE RECORD: 20632fee ('feat(S-COLDBOOT-01): drop Convex boot path from app/_layout.tsx', 2026-07-18) removed the provider; Sprint 24 commits 8c9dbade / 37d88549 / 52b68dfd / 4d7ccec7 / 5fe0663d (2026-07-23) rewired chat, documents/articles/narration, subscriptions/whats-new/settings, research/toolbelt/notifications, and the residual crash paths onto Zero/Hono; 35d9614f (2026-07-26) landed the CAP-CUT-01 grep gate as EMPTY.
- BOOT PROOF — WHICH FLOW. No existing .maestro flow can be used verbatim. .maestro/ DOES NOT EXIST at 25414ad1 (git ls-tree -r --name-only 25414ad1 -- .maestro is empty), so the fallback flow must be authored at HEAD and driven against the installed pinned binary. The nearest template is .maestro/chat/drawer-loads-seeded.yml (cold boot -> chat-screen -> drawer-content -> three conversation-row asserts); its testID vocabulary is compatible with the pinned build but its transport is not (see dev-client note). Proposed new flow: .maestro/cutover/fallback-convex-boot.yml.
- TESTID COMPATIBILITY VERIFIED PER-ID AGAINST THE PINNED TREE, NOT ASSUMED. Present at 25414ad1: chat-screen (app/(drawer)/chat/[conversationId].tsx:279), chat-thread (:306), drawer-content and drawer-content-empty (screens/DrawerContent.tsx:270,262), conversation-row (components/ConversationRow.tsx:113), message-bubble (components/chat/MessageBubble.tsx:104), articles-route (app/articles.tsx:235), articles-list / articles-count-header / articles-empty-state (screens/articles-screen.tsx:222,218,255), article-card-pressable (components/ArticleCard.tsx:138). So the HEAD flow vocabulary transfers.
- BUT DEEP LINKS DO NOT TRANSFER. At 25414ad1, app/_layout.tsx handleIncomingURL (lines 44-81) matches on parsed.path and handles ONLY toolbelt/add, subscriptions, subscriptions/feed. It does not handle articles or chat/*, and it does not use the hostname form. `openLink: holocron://articles` (used by .maestro/articles/list-loads.yml) is a silent NO-OP against the pinned build. Navigate by tap instead: cold boot lands on chat because app/index.tsx at 25414ad1 is `<Redirect href="/chat/new" />`, then reach articles through the drawer entry wired at app/(drawer)/_layout.tsx:137 (router.push('/articles')).
- FATAL FAKEABILITY RISK #1 — DEV CLIENT. .maestro/chat/drawer-loads-seeded.yml cold-boots via `openLink: ${MAESTRO_DEV_CLIENT_OPEN_URL}` against a live Metro bundler, and every package.json start/build script (:11-15) is dev-client oriented. A dev client loads JS from whatever revision Metro is serving, so a dev-client 'pinned build' proves nothing about the pinned SHA. The archived artifact MUST be a Release-configuration standalone binary with the JS bundle embedded (expo prebuild + expo run:ios --configuration Release, or EAS), and Metro MUST be stopped during the boot proof. Record metro_required=false / dev_client=false in the manifest.
- FATAL FAKEABILITY RISK #2 — INDISTINGUISHABLE BINARIES. app.config.cjs declares bundleIdentifier 'com.holocron.app' / package 'com.holocron.app' / version '1.0.0' with NO buildNumber at both 25414ad1 (lines 11,23,45) and HEAD (lines 10-11,23,45). Installing the pinned build replaces the HEAD build on the same simulator and nothing in the binary distinguishes them afterwards. Inject build identity at build time: set ios.buildNumber / android.versionCode to the short SHA 25414ad1, and read CFBundleVersion back from the INSTALLED bundle via `plutil -p <installed .app>/Info.plist` into the evidence manifest. Uninstall com.holocron.app before install so no ambiguous state remains.
- REPRODUCIBILITY — ios/ and android/ are gitignored (.gitignore:44-45), so native projects do not exist at 25414ad1 and must be regenerated by expo prebuild. The pin needs THREE identity facts: source SHA, pnpm-lock.yaml hash at that SHA (dependency drift changes the bundle), and sha256 of the produced .app/.ipa, all recorded in the manifest and re-verified before every boot proof.
- OTA OVERRIDE — expo-updates ~55.0.14 (package.json:113) ships in the app; a pinned binary can silently swap its JS bundle from an update channel. The archived build must be produced with updates disabled or bound to a frozen channel, and the manifest must record which.
- THE EMPTY-SHELL FAILURE MODE IS ACTIVE IN THIS EXACT CODE — this is the classic fakeable 'renders' AC and it will fire here. At 25414ad1, app/(drawer)/_layout.tsx:44 is `const conversations = useQuery(api.conversations.index.list, { limit: 50 }) ?? [];`. Convex useQuery returns undefined until the socket resolves and the `?? []` coalesces that to an EMPTY LIST, so an unreachable or frozen-but-unauthenticated Convex renders a fully mounted, non-crashing drawer with zero rows — visually identical to 'no conversations'. Any oracle of the form 'the app boots' / 'the screen renders' passes against a Convex that was never contacted. The oracle must be a positive row count PLUS exact title literals PLUS an independent egress delta.
- SEED DATA MUST NOT COME FROM holo seed:e2e (package.json:40) — that seeds Postgres/Zero, which the pinned build cannot see. Snapshot the expected values from the FROZEN Convex deployment immediately before the run using the existing real client services/platform/src/cutover/convex-fence-client.ts:239 (which already resolves EXPO_PUBLIC_CONVEX_URL), writing .tmp/D07-02/frozen-convex-snapshot.json with conversation_count, top_titles[0..2] and document_count; then assert the UI against that snapshot.
- CONVEX-BACKED SCREENS AVAILABLE AS ORACLES AT THE PINNED SHA: drawer conversations useQuery(api.conversations.index.list, {limit:50}) at app/(drawer)/_layout.tsx:44; articles list useQuery(api.documents.queries.list) and count useQuery(api.documents.queries.countByCategory, {}) at app/articles.tsx:50,57; document detail useQuery(api.documents.queries.get) plus the .convex.cloud -> .convex.site derivation from EXPO_PUBLIC_CONVEX_URL at app/document/[id].tsx:62,102.
- EXPO_PUBLIC_CONVEX_URL IS STILL A LIVE RESOLVED ENV IN THE PLATFORM, not a dead name: services/platform/src/cutover/convex-fence-client.ts:239-244 (throws without it), services/platform/src/cutover/article-baseline.ts:276-283, services/platform/tests/integration/write-fence-red.helpers.ts:433-438. The same value feeds the pinned build at launch. services/platform/src/cli/__tests__/secrets-hygiene.test.ts:75 treats it as a scanned secret name, so it must be supplied through the consolidated secrets path, never a committed .env.

**References:**

- `app/_layout.tsx:31 (HEAD comment: cold-boot uses ZeroProvider only, no legacy data-plane client)`
- `app/_layout.tsx:198-221 (HEAD — ZeroProvider mount; no Convex provider exists to fall back on)`
- `app/_layout.tsx:5,19-21,25,125,145 @25414ad1 (ConvexProvider + EXPO_PUBLIC_CONVEX_URL wiring that defines the pinned revision)`
- `app/_layout.tsx:28 @9b8d1596 (new ConvexReactClient(platformUrl) — proof that post-D01-04 revisions are NOT Convex-cloud-pointing)`
- `app/_layout.tsx:44-81 @25414ad1 (handleIncomingURL — only toolbelt/add, subscriptions, subscriptions/feed; path-form matching)`
- `app/index.tsx:5 @25414ad1 (Redirect href="/chat/new" — cold-boot landing screen of the pinned build)`
- `app/(drawer)/_layout.tsx:44 @25414ad1 (useQuery(api.conversations.index.list) ?? [] — the empty-shell coalescing)`
- `app/(drawer)/_layout.tsx:137 @25414ad1 (router.push('/articles') — tap route replacing the unsupported deep link)`
- `screens/DrawerContent.tsx:262,270 @25414ad1 (drawer-content-empty, drawer-content)`
- `components/ConversationRow.tsx:113 @25414ad1 (conversation-row)`
- `components/chat/MessageBubble.tsx:104 @25414ad1 (message-bubble default testID)`
- `app/(drawer)/chat/[conversationId].tsx:279,306 @25414ad1 (chat-screen, chat-thread)`
- `app/articles.tsx:50,57,235 @25414ad1 (Convex documents list + countByCategory queries, articles-route)`
- `screens/articles-screen.tsx:218,222,255 @25414ad1 (articles-count-header, articles-list, articles-empty-state)`
- `components/ArticleCard.tsx:138 @25414ad1 and components/ArticleCard.tsx:140 @HEAD (article-card-pressable in both)`
- `app/document/[id].tsx:62,102 @25414ad1 (EXPO_PUBLIC_CONVEX_URL -> .convex.site derivation; Convex document query)`
- `app.config.cjs:11,23,45 @25414ad1 and app.config.cjs:10-11,23,45 @HEAD (identical bundleIdentifier/version, no buildNumber)`
- `.gitignore:44-45 (ios/ and android/ untracked — prebuild required for a reproducible artifact)`
- `package.json:11-15,40,113 (dev-client-only start/build scripts; seed:e2e seeds Postgres; expo-updates present)`
- `.maestro/chat/drawer-loads-seeded.yml (dev-client + Metro cold boot; testIDs compatible, transport is not)`
- `.maestro/articles/list-loads.yml (openLink holocron://articles — unsupported at the pinned revision)`
- `.maestro/chat/thread-loads.yml (chat-screen / chat-thread / message-bubble index oracle pattern to mirror)`
- `services/platform/src/cli/commands/verify-no-convex-client.ts:12 (DEFAULT_NO_CONVEX_CLIENT_ROOTS = app, components, hooks, screens)`
- `services/platform/src/cutover/convex-fence-client.ts:239-244 (real frozen-Convex client for the pre-run snapshot)`
- `services/platform/src/cutover/article-baseline.ts:267-289 (convexSiteBase — same env contract the pinned build uses)`

**Gaps (do not plan around these):**

- The pre-rewrite Convex-pointing revision IS identifiable from git history (25414ad1b34720c11de12323cc6609309c1023cb) — no implementer discovery needed. What does NOT exist is any built artifact, manifest, archive location, or checksum for it.
- No pinned fallback build artifact or manifest exists anywhere in the repo; .tmp/D07-02/ does not exist and nothing under services/platform/src/cutover/ references an app build.
- No .maestro flow can be reused verbatim: .maestro/ did not exist at 25414ad1, all HEAD flows are Zero/Postgres-seeded, and the two candidates depend on either a Metro dev client (drawer-loads-seeded.yml) or a deep link the pinned revision does not route (articles/list-loads.yml). .maestro/cutover/fallback-convex-boot.yml must be authored new.
- No build-identity mechanism exists: identical bundleIdentifier and version at both revisions with no buildNumber, so after install there is no way to confirm which binary is on the device.
- No Release-configuration build path is scripted — every package.json build/start script (:11-15) is dev-client oriented and build:ios is `expo run:ios` with no --configuration Release.
- No tooling emits frozen-Convex expected values in a shape a Maestro oracle can assert on; convex-fence-client.ts and article-baseline.ts reach Convex but neither produces conversation titles or document counts. The snapshotter must be written.
- expo-updates OTA channel policy for the pinned build is unspecified anywhere in the repo; nothing prevents the archived binary's JS from being replaced after archival.
- No attestation exists that the Convex deployment is live and un-deleted through the soak — the other half of AC-1 (devops-engineer). The client boot proof is void without it and should be a hard precondition of the boot-proof AC.

## Notes

- estimate_minutes 90 is tight for this scope (attestation loop + hash chain + pinned-build worktree/digest + reaches-Convex discriminator + real simulator boot pipeline). Comparable Sprint 29 devops tasks with narrower scope ran 120-150 min (e.g. REDHAT-FIX-S29-H05 at 120, R2-C04 at 150). Flagging per stub-preservation rule — estimate left as given, not silently changed.
- Sprint 29 is Blocked (1 CRITICAL, 4 HIGH from the final independent red-hat at 6de957d3) — this task's real-service tests run inside that non-green soak; do not fixture-substitute a healthy soak to make AC-2 pass.
- PIN CORRECTED DURING PLANNING: an earlier draft of this task pinned fe78fe5a6620a2e0bc7324064e13e53664eca2c1 (last commit with convex/react imports) as the fallback build. react-native-ui-planner flagged that this commit is downstream of 9b8d1596 (D01-04, 'Convex env alias removal'), which repointed app/_layout.tsx's ConvexReactClient construction from EXPO_PUBLIC_CONVEX_URL to EXPO_PUBLIC_PLATFORM_URL — so a build from fe78fe5a imports the Convex SDK but actually talks to Hono, not frozen Convex, which would have made AC-4's boot proof vacuous (the exact empty-shell failure mode AC-4 was designed to catch). Independently re-verified via `git show <sha>:app/_layout.tsx` at 25414ad1b34720c11de12323cc6609309c1023cb (= 9b8d1596^), 9b8d1596, and fe78fe5a6620a2e0bc7324064e13e53664eca2c1 before correcting: 25414ad1 is the last commit where the client is genuinely built from EXPO_PUBLIC_CONVEX_URL. The corrected pin is 25414ad1b34720c11de12323cc6609309c1023cb; fe78fe5a is retained ONLY as the required negative-control fixture (platform_pointing_convex_react_commit) proving AC-3's discriminator would have caught this exact mistake.
- AC-4 (boot) is the deliberately fail-closed AC called out in the dispatch: a full native simulator build of a pre-rewrite revision is expensive and may break against now-incompatible toolchain/dependency versions. The task must attempt the real Maestro cold-boot flow honestly and report BOOT_UNVERIFIED rather than fabricate a pass when it cannot complete — this is a plan-time-acknowledged gap, not an oversight.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D07-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "real_convex_deployment": {
      "description": "The actual dev/staging Convex deployment configured via EXPO_PUBLIC_CONVEX_URL/CONVEX_URL, already holding the migrationFence.audit functions deployed by Sprint 29 D06-03. Pre-existing external deployment \u2014 this task only observes/probes it, never seeds it.",
      "seed_method": "recorded_external",
      "records": [
        "Convex deployment reachable at CONVEX_URL with migrationFence.audit.latestFenceArmed query registered",
        "convex/ directory present in the repo (not deleted)"
      ]
    },
    "unreachable_convex_target": {
      "description": "EXPO_PUBLIC_CONVEX_URL pointed at a local port that is bound then immediately closed before the probe runs, proving the reachability check can genuinely observe a failure rather than always returning true.",
      "seed_method": "cli",
      "records": [
        "ephemeral port bound via node:net createServer then closed synchronously before cutover:attest-convex-live runs"
      ]
    },
    "armed_soak_with_live_hono": {
      "description": "A real Hono server (createHonoApp) started as a pre-existing OS child process listening on an ephemeral port BEFORE the attestation window begins (never in-process createHonoApp), with HOLO_MIGRATION_READ_ONLY durably armed via writeDurableMigrationReadOnly('1') against a disposable secrets.yaml.",
      "seed_method": "cli",
      "records": [
        "disposable secrets.yaml with HOLO_MIGRATION_READ_ONLY: \"1\"",
        "pre-existing bun child process serving /health and POST /api/documents on 127.0.0.1:<ephemeral-port>"
      ]
    },
    "pinned_pre_rewrite_commit": {
      "description": "Git commit 25414ad1b34720c11de12323cc6609309c1023cb (chore(D01-01): mark AC checkboxes completed after land \u2014 the direct parent of 9b8d1596) checked out into an isolated git worktree. Verified during planning via `git show 25414ad1:app/_layout.tsx`: line 5 imports ConvexProvider/ConvexReactClient from 'convex/react'; line 19 reads `const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;`; line 25 builds `new ConvexReactClient(convexUrl ?? 'https://placeholder.convex.cloud')`; lines 125/145 wrap the tree in <ConvexProvider>. This is the last revision that both imports convex/react AND actually points the client at the Convex cloud deployment \u2014 its child 9b8d1596 (D01-04, 'Convex env alias removal') repointed the same construction to `new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111')` sourced from EXPO_PUBLIC_PLATFORM_URL (Hono), not Convex. CORRECTION FROM PLANNING: an earlier draft of this task pinned fe78fe5a6620a2e0bc7324064e13e53664eca2c1 on convex/react-import evidence alone; that commit is downstream of the 9b8d1596 repoint and therefore ALSO points at EXPO_PUBLIC_PLATFORM_URL \u2014 a build from it imports the SDK but cannot reach frozen Convex, which would have made the boot AC (AC-4) vacuous. Caught by react-native-ui-planner and independently re-verified here via `git show <sha>:app/_layout.tsx` at both SHAs before correcting.",
      "seed_method": "cli",
      "records": [
        "git worktree add .tmp/D07-02/pinned-fallback-worktree 25414ad1b34720c11de12323cc6609309c1023cb",
        "app/_layout.tsx:5 imports ConvexProvider/ConvexReactClient from 'convex/react' at this SHA",
        "app/_layout.tsx:19,25 build the client from process.env.EXPO_PUBLIC_CONVEX_URL at this SHA",
        "app/_layout.tsx:125,145 wrap the tree in <ConvexProvider> at this SHA"
      ]
    },
    "platform_pointing_convex_react_commit": {
      "description": "Git commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 \u2014 imports convex/react (it is the last commit before 5fe0663d removed the final such imports from components/hooks/screens) but is downstream of the 9b8d1596 repoint, so its app/_layout.tsx:28 constructs ConvexReactClient from EXPO_PUBLIC_PLATFORM_URL, not EXPO_PUBLIC_CONVEX_URL \u2014 it talks to Hono, not Convex. Used ONLY as a required negative-control comparand proving cutover:pin-fallback-build's reaches-Convex discriminator actually discriminates (this is the exact SHA a naive import-only check would have wrongly accepted during planning) \u2014 it must never be recorded as the pin.",
      "seed_method": "cli",
      "records": [
        "git show fe78fe5a6620a2e0bc7324064e13e53664eca2c1:app/_layout.tsx | grep ConvexReactClient \u2192 new ConvexReactClient(platformUrl ?? 'http://127.0.0.1:4111')",
        "platformUrl at this SHA is sourced from process.env.EXPO_PUBLIC_PLATFORM_URL, not EXPO_PUBLIC_CONVEX_URL"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a reachable Convex deployment WHEN a 3-tick attestation window runs THEN every tick independently confirms reachability and the evidence hash-chains",
      "verify": "bun services/platform/src/cli/holo.ts cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN an armed fence and live server WHEN the attestation window runs THEN every tick's real write probe returns 423 migration_read_only, and a mid-window disarm is caught",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN commit 25414ad1b34720c11de12323cc6609309c1023cb (reaches Convex) and fe78fe5a6620a2e0bc7324064e13e53664eca2c1 (imports convex/react but points at Hono) WHEN pin-fallback-build runs against each THEN the first is accepted with reaches_convex:true and the second is refused with PIN_DOES_NOT_REACH_CONVEX",
      "verify": "bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the pinned manifest for 25414ad1b34720c11de12323cc6609309c1023cb WHEN verify-fallback-boot runs THEN it either produces a real Maestro session log or fails closed with BOOT_UNVERIFIED",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "attest-convex-live ok:true with all ticks reachable",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts cutover:attest-convex-live --ticks 3 --interval-ms 1500 --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "attest-convex-live ok:false on unreachable target",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-1-negative"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "evidence file hash-chains",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t hash-chain"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "write probe blocked every tick",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "mid-window disarm caught",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint30-convex-live-attestation.test.ts -t AC-2-negative"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "pinned commit differential recorded (25414ad1, reaches_convex true)",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit 25414ad1b34720c11de12323cc6609309c1023cb --json"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "HEAD has zero convex/react imports",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-convex-client --json"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "boot verified with real session log",
      "maps_to_ac": "AC-4",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "boot fails closed without simulator",
      "maps_to_ac": "AC-4",
      "verify": "HOLO_DISABLE_SIMULATOR=1 bun services/platform/src/cli/holo.ts cutover:verify-fallback-boot --json"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "pin-fallback-build refuses the platform-pointing decoy commit fe78fe5a with PIN_DOES_NOT_REACH_CONVEX",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts cutover:pin-fallback-build --commit fe78fe5a6620a2e0bc7324064e13e53664eca2c1 --json"
    }
  ]
}
-->
