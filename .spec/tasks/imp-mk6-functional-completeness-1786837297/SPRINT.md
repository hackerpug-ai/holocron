# Sprint: imp-mk6-functional-completeness-1786837297

> Learned spec repair: tt-004
> Immutable objective: Restore all MK-VI scoped functionality to specified operation
> Requirement source: `.spec/prds/mk6-migration/**` (read-only)
> Binding ScopeState: `/Users/justinrich/.config/brain/improvements/imp-mk6-functional-completeness-1786837297.json` (read-only)
> Proposed by: mastra-planner
> Updated: 2026-08-16

## Why this task map exists

The original bridge produced one six-file capability-ledger task from the binding ScopeState's selected minimum. Review cycle 4 proved that task contract invalid for AC-3: all five semantic controls were `command: unavailable`, their real seams sit outside the ledger files, and the selected minimum excluded the H0-H4 repairs required by the objective.

This folder is therefore a **learned spec repair**, not a claim that tasks were regenerated from an unchanged ScopeState. It does not amend the immutable PRD or binding ScopeState. It preserves the original ledger task and remediation history, places real product and proof work in bounded prerequisite tasks, and unblocks the ledger only after those tasks publish executable real-service controls.

## Executable task map

| Wave | ID | Package | Logical assignee | Priority | Type | Covers |
|---|---|---|---|---|---|---|
| 0 | MK6-DEP-001 | Real verification environment and external prerequisite classification | devops-engineer | P0 | infrastructure | dependency provisioning |
| 1 | MK6-DATA-001 | Postgres data-plane truth | mastra-implementer | P0 | bugfix | H0-05 |
| 1 | MK6-QUEUE-001 | Scheduler ownership, persistence, and recreation control | mastra-implementer | P0 | bugfix | H0-03 |
| 1 | MK6-BACKUP-001 | Backup, heartbeat, alert runtime | devops-engineer | P0 | infrastructure | H0-04 |
| 2 | MK6-RUNTIME-001 | Release-bound runtime and fleet readiness | mastra-implementer | P0 | bugfix | H0-01, H0-02 |
| 2 | MK6-MISSION-001 | Mastra mission lifecycle and server-side Zero publication | mastra-implementer | P0 | feature | H1-01, H1-06 server |
| 2 | MK6-MCP-001 | MCP executor semantics and durable mutations | mcp-implementer | P0 | bugfix | H1-02 |
| 3 | MK6-MCP-002 | All-44 dual-transport behavioral sweep | mcp-implementer | P0 | feature | H1-03, H2-05 MCP |
| 3 | MK6-CLIENT-001 | Client runtime configuration and durable mutations | react-native-ui-implementer | P0 | bugfix | H1-04, H1-06 client |
| 4 | MK6-CLIENT-002 | Drawer, mission observation, and Zero state truth | react-native-ui-implementer | P0 | bugfix | H1-05 |
| 4 | MK6-CLIENT-003 | Chat terminal semantics and real offline proof | react-native-ui-implementer | P1 | verification | H2-04, H2-05 client |
| 3 | MK6-RECOVERY-001 | Fail-closed restore and retained-byte evidence | devops-engineer | P0 | bugfix | H2-01, H0-04 proof |
| 5 | MK6-CUTOVER-001 | Retired Convex plane, D08-02, and D08-09 readiness | devops-engineer | P0 | verification | H2-02, H2-03 |
| 5 | MK6-RELEASE-001 | Immutable candidate release orchestration | devops-engineer | P0 | infrastructure | H2-06 producer |
| 6 | imp-mk6-functional-completeness-1786837297-mk6-functional-completeness | Existing 105-criterion capability ledger | mastra-implementer | P1 | bugfix | AC-1..AC-5, H2-06 gate |
| 7 | MK6-PROMOTION-001 | Exact-release promotion and 24h/72h soak | devops-engineer | P0 | manual verification | H3-01, H3-02 |
| 8 | MK6-DECOMMISSION-001 | Fresh D08-03/D08-09 and authorized D08-05 deletion | devops-engineer | P0 | manual verification | H4-01, H4-02, H4-03 |

## Dependency graph

```text
MK6-DEP-001
  ├─ MK6-DATA-001 ─┬─ MK6-QUEUE-001 ─┐
  │                │                 ├─ MK6-RUNTIME-001 ─┐
  └─ MK6-BACKUP-001┴─────────────────┘                  │
                                                        ├─ MK6-MISSION-001 ─┬─ MK6-MCP-001 ─ MK6-MCP-002
                                                        │                    └─ MK6-CLIENT-001 ─ MK6-CLIENT-002 ─ MK6-CLIENT-003
MK6-BACKUP-001 ─ MK6-RECOVERY-001                        │
                                                         └──────────────────────────────────────────────┐
all product/proof lanes ─ MK6-CUTOVER-001 ─ MK6-RELEASE-001 ─ existing ledger ─ MK6-PROMOTION-001 ─ MK6-DECOMMISSION-001
```

No downstream task may count an upstream checkbox, source presence, historical artifact, static grep, fixture, mock, skipped test, or self-attested liveness as proof. Each dependency is satisfied only by its task's exact real-service command and retained evidence.

## Named AC-3 controls and producers

| Control | Producing task | Executable command consumed by the ledger |
|---|---|---|
| missing-evidence | MK6-RECOVERY-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --negative-control missing-evidence --json` |
| queue-recreation | MK6-QUEUE-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json` |
| mission-501 | MK6-MISSION-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-mission-lifecycle.sh --negative-control mission-501 --json` |
| MCP semantic-no-op | MK6-MCP-001 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json` |
| client-fallback | MK6-CLIENT-003 | `PLATFORM_IT=1 bash scripts/e2e/run-mk6-client-fallback-control.sh --json` |

## Manual-only boundary

R2 restore credentials, a named unshared iOS simulator, a second authorized tailnet device, installed-host promotion, elapsed 24h/72h soak, and permanent Convex cloud deletion require explicit operator authority. Their task files say `MANUAL-ONLY`; missing authority is a blocker, never permission to use fixtures, historical evidence, a shared simulator, or a local-only substitute.

## Shared-file ownership

- `services/platform/src/index.ts` and `services/platform/src/http/hono-app.ts`: MK6-MISSION-001 only.
- `services/platform/src/mcp/executor.ts`: MK6-MCP-001 only.
- `services/platform/src/mcp/gateway.ts` and tool registry/schema: MK6-MCP-002 only.
- queue backend/worker: MK6-QUEUE-001 only; health files: MK6-RUNTIME-001 only.
- backup runtime and launchd files: MK6-BACKUP-001; recovery verifier/fire-drill files: MK6-RECOVERY-001.
- client root config: MK6-CLIENT-001; drawer/state surfaces: MK6-CLIENT-002; chat/offline gates: MK6-CLIENT-003.
- deploy/compose files: MK6-RELEASE-001 only.
- the binding six ledger files, including `holo.ts` and `gate-registry.ts`: the existing ledger task only.

## Completion rule

The objective is not complete until the exact promoted release has a new 105/105, 10/10 H2-06 receipt ledger, survives 72 hours, passes fresh D08-03 and two-device D08-09, and receives explicit operator authorization for D08-05. Until then the original ledger task remains blocked and Convex deletion remains closed.

## Testing gate

Every task must pass its exact TC commands against the named real services, its embedded Scenario Contract must validate with `brain/tools/validate-scenario/validate_scenario.py`, and its task charter must pass `brain/scripts/surface/surface charter validate --kind task`. The sprint gate rejects mocks, fixtures-as-proof, skipped lanes, nonterminal output, empty successful reads, historical receipts, and manual gates without operator evidence.
