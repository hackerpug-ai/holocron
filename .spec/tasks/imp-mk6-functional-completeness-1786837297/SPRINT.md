# Sprint: imp-mk6-functional-completeness-1786837297

> Learned spec repair: tt-004, remediation cycle 1
> Immutable objective: Restore all MK-VI scoped functionality to specified operation
> Requirement source: `.spec/prds/mk6-migration/**` (read-only)
> Binding ScopeState: `/Users/justinrich/.config/brain/improvements/imp-mk6-functional-completeness-1786837297.json` (read-only)
> Proposed by: mastra-planner
> Updated: 2026-08-16

## Why this task map exists

The original bridge produced one six-file capability-ledger task from the binding ScopeState's selected minimum. Review cycle 4 proved that task contract invalid for AC-3: its five semantic controls were `command: unavailable`, their real seams sit outside the ledger, and the selected minimum excluded the H0-H4 repairs required by the objective.

This is a **learned spec repair**, not regeneration from an unchanged ScopeState. It does not amend the immutable PRD or ScopeState. It preserves the ledger history, gives every product/proof seam one exclusive owner, and unblocks the ledger only after a single immutable candidate plus executable real-service controls exist.

## Executable task map

Every wave is topological: a task's dependencies are strictly earlier waves.

| Wave | ID | Package | Logical assignee | Priority | Covers |
|---:|---|---|---|---|---|
| 0 | MK6-DEP-001 | Isolated real verification environment | devops-engineer | P0 | dependency provisioning |
| 1 | MK6-HOST-001 | Authoritative host, SSH, private Serve, writer topology | devops-engineer | P0 | H0-01 |
| 1 | MK6-DATA-001 | Export/Postgres migration truth foundation | mastra-implementer | P0 | H0-05 foundation |
| 2 | MK6-FLEET-001 | Explicit tailnet fleet routing for both consumers | mastra-implementer | P0 | H0-02 |
| 2 | MK6-QUEUE-001 | Scheduler ownership, persistence, recreation control | mastra-implementer | P0 | H0-03 |
| 2 | MK6-PROVENANCE-001 | Canonical CLI/build-info/pre-delete inventory | devops-engineer | P0 | H2-03 |
| 3 | MK6-BACKUP-001 | Installed backup, alert, heartbeat runtime | devops-engineer | P0 | H0-04 |
| 3 | MK6-NATIVE-001 | Worktree-local native build isolation | react-native-ui-implementer | P0 | H2-04 |
| 4 | MK6-RUNTIME-001 | External release-bound readiness | mastra-implementer | P0 | H0 runtime exit |
| 4 | MK6-RECOVERY-001 | Retained-byte restore verifier | devops-engineer | P0 | H2-01, H4 tooling |
| 5 | MK6-MISSION-001 | Mastra mission lifecycle and Zero publication | mastra-implementer | P0 | H1-01, H1-06 server |
| 6 | MK6-MCP-001 | MCP executor semantics and durable mutations | mcp-implementer | P0 | H1-02 |
| 7 | MK6-MCP-002 | All-44 dual-transport behavioral sweep | mcp-implementer | P0 | H1-03, H2-05 MCP |
| 8 | MK6-CLIENT-001 | Client config and durable mutation boundary | react-native-ui-implementer | P0 | H1-04, H1-06 client |
| 9 | MK6-CLIENT-002 | Drawer and mission observation | react-native-ui-implementer | P0 | H1-05 primary |
| 10 | MK6-CLIENT-004 | Secondary empty/stale/error/blob/import/research states | react-native-ui-implementer | P1 | H1-05 secondary |
| 11 | MK6-CLIENT-003 | Chat, scoped service faults, five reconnect cases | react-native-ui-implementer | P1 | H2-05 client |
| 12 | MK6-DATA-002 | Final PG/HTTP/MCP/Zero sentinel attestation | mastra-implementer | P0 | H0-05 exit |
| 13 | MK6-CUTOVER-001 | Retired-plane and D08-09 readiness | devops-engineer | P0 | H2-02 |
| 14 | MK6-RELEASE-001 | Immutable candidate orchestration | devops-engineer | P0 | H2-06 producer |
| 15 | imp-mk6-functional-completeness-1786837297-mk6-functional-completeness | Existing 105-criterion ledger | mastra-implementer | P1 | H2-06 gate |
| 16 | MK6-PROMOTION-001 | Land/push/install exact approved digest | integrator | P0 | H3-01 |
| 17 | MK6-SOAK-001 | 24h/72h semantic and operational soak | observability-engineer | P0 | H3-02 |
| 18 | MK6-DECOMMISSION-001 | Fresh D08-03/D08-09 and authorized D08-05 | devops-engineer | P0 | H4-01..03 |

## Exact dependency DAG

```text
W0  MK6-DEP-001
W1    ├─ MK6-HOST-001
      └─ MK6-DATA-001
W2  HOST -> MK6-FLEET-001, MK6-PROVENANCE-001
    DATA -> MK6-QUEUE-001
W3  HOST + PROVENANCE -> MK6-BACKUP-001
    DEP + PROVENANCE -> MK6-NATIVE-001
W4  HOST + FLEET + DATA + QUEUE + BACKUP -> MK6-RUNTIME-001
    BACKUP -> MK6-RECOVERY-001
W5  FLEET + DATA + QUEUE + RUNTIME -> MK6-MISSION-001
W6  DATA + QUEUE + MISSION -> MK6-MCP-001
W7  FLEET + RUNTIME + MISSION + MCP-001 -> MK6-MCP-002
W8  MISSION + MCP-002 -> MK6-CLIENT-001
W9  CLIENT-001 -> MK6-CLIENT-002
W10 CLIENT-002 -> MK6-CLIENT-004
W11 CLIENT-001 + CLIENT-004 + RUNTIME -> MK6-CLIENT-003
W12 HOST + FLEET + QUEUE + BACKUP + RUNTIME + MCP-002 + CLIENT-003 -> MK6-DATA-002
W13 DATA-002 + MCP-002 + CLIENT-003 + RECOVERY + NATIVE + PROVENANCE -> MK6-CUTOVER-001
W14 CUTOVER + all product lanes -> MK6-RELEASE-001
W15 MK6-RELEASE-001 -> existing ledger
W16 existing ledger -> MK6-PROMOTION-001
W17 MK6-PROMOTION-001 -> MK6-SOAK-001
W18 MK6-SOAK-001 -> MK6-DECOMMISSION-001
```

The ledger depends exactly on `MK6-RELEASE-001`; promotion, soak, and decommission remain downstream and incomplete. No semantic cycle exists.

## Named isolated AC-3 controls

Each producer first proves its baseline against real services, then executes an isolated disposable mutant; no production fault hook is allowed.

| Control | Sole producer | Exact command |
|---|---|---|
| missing-evidence | MK6-RECOVERY-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json` |
| queue-recreation | MK6-QUEUE-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json` |
| mission-501 | MK6-MISSION-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json` |
| MCP semantic-no-op | MK6-MCP-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json` |
| client-fallback | MK6-CLIENT-001 | `PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --negative-control client-fallback --json` |

## Exclusive shared-file ownership

- `holo.ts`: MK6-PROVENANCE-001 only; ledger consumes the command but owns only its remaining five gate files.
- `index.ts`, `hono-app.ts`, and literal mission files: MK6-MISSION-001 only.
- MCP executor: MK6-MCP-001; gateway/registry/literal schema files: MK6-MCP-002.
- queue backend/worker: MK6-QUEUE-001; health/deployment identity: MK6-RUNTIME-001.
- backup runtime/launchd: MK6-BACKUP-001; recovery fire-drill/verifier: MK6-RECOVERY-001.
- native build scripts: MK6-NATIVE-001; CUTOVER consumes their receipt and never edits them.
- client root config/mutations: CLIENT-001; drawer/mission: CLIENT-002; secondary state surfaces: CLIENT-004; chat/reconnect proof: CLIENT-003.
- deploy/compose/promotion producer: RELEASE-001; promotion evidence: PROMOTION-001; soak script/evidence: SOAK-001; authorized deletion producer/evidence: DECOMMISSION-001.
- Immutable `.spec/prds/mk6-migration/**`, historical evidence, and binding ScopeState are read-only and owned by no task here.

## Manual-only boundary

Real R2 restore access, named unshared iOS simulator, second authorized tailnet device, authoritative-host access, trunk push/install authority, actual elapsed 24h/72h, and named D08-05 deletion authorization are external prerequisites. Missing authority blocks the task; it never permits historical evidence, fixtures, shared simulator mutation, network disruption, force flags, or self-authorization.

## Completion and testing gate

The objective is not complete until the exact promoted release has a fresh 105/105 and 10/10 ledger, survives 72 hours, passes fresh D08-03 plus two-device D08-09, and receives explicit operator authorization for D08-05. Every task must pass its exact real-service TC commands, all behavioral AC Scenario Contracts, charter validation, scope-overlap and DAG/wave audits, and normal repository hooks. Skips, empty successes, mocks, structural fixtures, static grep, historical receipts, or self-attested liveness fail the sprint.
