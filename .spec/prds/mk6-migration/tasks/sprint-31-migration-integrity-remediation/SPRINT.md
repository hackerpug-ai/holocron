---
sprint: 31
title: Migration Integrity Remediation
sequence: 31
timeline: Phase 7 — Cutover and Decommission
status: Completed with accepted exceptions
planned_from_roadmap_sha: ad8ab6125eac1b1f82c068f5e2df90795d0c2473f9450f514bb0e94e67345e73
planned_from_source_sha: 54299bfc76fec6fc52468dae451ca293a6f104c4
planned_from_source_kind: git-head
planned_at: 2026-08-08T01:09:02Z
---

# Sprint 31: Migration Integrity Remediation

**Sequence:** 31
**Timeline:** Phase 7 — Cutover and Decommission
**Status:** Completed — accepted exceptions
> Progress: implementation tasks landed; operator closeout accepted with exceptions · updated 2026-08-09T22:10:00Z

> **Closure note.** Sprint 31 is closed administratively with accepted operator exceptions. The live gate state remains `met:false`; see the closure register below and `.tmp/sprint-31-migration-integrity-remediation/sprint-goal-state.json` for the fail-closed evidence.

---

## Overview

A 29-sprint adversarial audit found that several capabilities the roadmap marked ✅ Completed are not implemented, and that five verifier commands are structurally incapable of failing — which is the mechanism by which those claims shipped as green. Sprint 32 deletes `convex/` and the Convex cloud deployment irreversibly; any capability still implemented only in Convex becomes unrecoverable at that moment.

This sprint makes the migration's own claims true before that door closes. Scope was set by the dispatched specialist SET against the PRD's locked scope: 15 findings were rejected as out-of-scope (recorded in [`01-scope.md`](../../01-scope.md)) and 29 recorded as risks (recorded in [`08-technical-risks.md`](../../10-technical-requirements/08-technical-risks.md)) rather than becoming tasks.

---

## Human Test Deliverable

An operator can revoke Convex credentials on the mini and confirm the platform still serves every capability it claims — scheduled jobs firing, all 44 MCP tools returning Postgres-backed results, chat routing to a real specialist, missions emitting traces, backups alerting on failure, and every verifier refusing a seeded violation.

**Test Steps:**
1. Revoke Convex credentials on the mini, then restart the platform stack.
2. Rebuild the database from migrations alone; confirm the fk-audit validates all 80 edges.
3. Wait for the `morning-digest` window; confirm a digest row appears unprompted.
4. Invoke all 44 MCP tools over stdio; confirm each returns Postgres-backed results.
5. Send a chat message; confirm the reply names a specialist beyond divergent/convergent.
6. Run `holo mission run research`; confirm its trace appears in self-hosted Langfuse.
7. Induce a backup failure; confirm the alert reaches the operator unprompted.
8. Seed one synthetic violation per verifier; confirm each exits non-zero.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S31-01 | Make the Drizzle migration set the single source of schema truth | mastra-implementer | 300 min |
| S31-02 | Make the 16 migrated cron jobs perform their real side-effects on their real schedules | mastra-implementer | 900 min |
| S31-03 | Enforce monotonic fencing tokens and prove exactly-once with a real SIGKILL | mastra-implementer | 420 min |
| S31-04 | Rebuild chat as the triage→specialists→native tool loop the PRD specifies | mastra-implementer | 720 min |
| S31-05 | Make the 44 registered tools executable and cut the MCP gateway off Convex | mcp-implementer | 1200 min |
| S31-06 | Route extraction through the boot capability probe; stop the manifest advertising unproven capabilities | mastra-implementer | 300 min |
| S31-07 | Restore observability — self-hosted Langfuse in-repo, mission traces, telemetry on every fleet call | mastra-evals-implementer | 600 min |
| S31-08 | Make every gate and verifier fail closed when fed a known violation | mastra-evals-implementer | 540 min |
| S31-09 | Feed real model output into the evidence gate; assert ASSAY≠CHALLENGE on resolved roles | mastra-implementer | 480 min |
| S31-10 | Replace fabricated pipeline inputs with real retrieval for whatsNew, assimilate, shop | mastra-implementer | 660 min |
| S31-MCP-01 | Make the 44-tool dual-transport sweep fail on any non-success result | mcp-implementer | 150 min |
| S31-MCP-02 | Prove mutation replay leaves exactly one row for every declared-idempotent tool | mastra-implementer | 180 min |
| S31-MCP-03 | Close the verify-manifest gate holes with negative controls | mcp-implementer | 120 min |
| S31-MCP-04 | Reconcile the frozen manifest with the Postgres gateway it now describes | mcp-implementer | 150 min |
| S31-CX-01 | RED — content-blind reconciliation and non-gating FK audit pass on corrupt data | mastra-implementer | 90 min |
| S31-CX-02 | Prove the retained ETL archive is a faithful complete image of the live Convex deployment | convex-implementer | 150 min |
| S31-CX-03 | Content-level reconciliation with fail-closed handling of empty source tables | mastra-implementer | 180 min |
| S31-CX-04 | Derive the referential edge set from the Convex source; make the FK audit gate on it | convex-reviewer | 120 min |
| S31-CX-05 | Decommission-blocker inventory — prove no in-scope capability lives only in Convex | convex-reviewer | 150 min |
| S31-CX-06 | Restate ETL provenance truthfully — Sprint 29, not Sprint 14, proved full-corpus load | convex-reviewer | 90 min |
| S31-FE-01 | Bound every chat-path request and stream with a deadline that terminates in degraded | react-native-ui-implementer | 150 min |
| S31-FE-02 | Make an error representable in the Zero-backed hooks; collapse the duplicate degraded banner | react-native-ui-implementer | 240 min |
| S31-FE-04 | Delete the screen-level second reconciler and its module-level mutable globals | react-native-ui-implementer | 180 min |
| S31-FE-05 | Delete client dead code and type-only Convex residue that blocks Sprint 32 | react-native-ui-implementer | 150 min |
| S31-FE-06 | Freeze the client data contract; retire the tooling that now reports false positives | react-native-ui-implementer | 120 min |
| S31-FE-07 | Prove one declared offline contract behaviour end-to-end with Maestro on the simulator | react-native-ui-implementer | 180 min |
| S31-OPS-01 | Restore backup execution — plists, pgbackrest.conf, R2 token rotation, restic mirror, webhook | devops-engineer | 195 min |
| S31-OPS-02 | Restore alert-sweep truth — repoint to production, purge fixture rows, add the zero-row floor | devops-engineer | 90 min |
| S31-OPS-03 | Isolate integration/gate harnesses from production config paths | devops-engineer | 60 min |
| S31-OPS-04 | Install the fire-drill schedule; fix the isolation proof that rejects the real mini | devops-engineer | 60 min |
| S31-OPS-05 | Make ci-fast green and ci-integration schedulable | devops-engineer | 50 min |
| S31-OPS-06 | Reconcile the freeze-state config split-brain across secrets, env and live Convex | devops-engineer | 45 min |

**Operator-executed / irreversible (never agent-automated):** S31-CX-02 (fresh export against the live deployment), S31-OPS-01 (R2 credential rotation), S31-OPS-02 (production heartbeat DELETE).

### Task closure register — 2026-08-09

All implementation task tips are landed on `main` and their task specifications remain the authoritative acceptance-criteria record.

**Closed / landed:** S31-01, S31-02, S31-03, S31-04, S31-05, S31-06, S31-07, S31-08, S31-09, S31-10, S31-MCP-01, S31-MCP-02, S31-MCP-03, S31-MCP-04, S31-CX-01, S31-CX-03, S31-CX-04, S31-CX-05, S31-CX-06, S31-FE-01, S31-FE-02, S31-FE-04, S31-FE-05, S31-FE-06, S31-FE-07, S31-OPS-03, S31-OPS-04, S31-OPS-05, S31-OPS-06.

**Closed with accepted operator exception:**

- **S31-CX-02:** tooling and provenance gates landed; live export/archive fidelity comparison deferred while Convex is retained.
- **S31-OPS-01:** backup execution docs and agent-safe tests landed; R2 old-key revocation and negative control deferred.
- **S31-OPS-02:** zero-row floor and alert-sweep runbook landed; production purge completed after dump. Healthy-chain verification is not passed because the six retained real jobs are overdue and no webhook is configured.

This register records administrative closure, not a claim that the deferred primary gates passed. The durable goal sentinel intentionally remains `GATE-GOAL: BLOCKED met:false`.

---

## Human Testing Gate

**Gate:** With Convex credentials revoked on the mini, `holo verify:decommission-inventory` reports every classified capability resolving to a working non-Convex implementation.

*The revoked-credentials precondition is the gate, not the command name. A static classifier can regex its way to green; with Convex unreachable, a capability still routed through `convex/browser`, still reading `convex/taskCrons.ts`, or holding a load-bearing type-only Convex import does not classify as unresolved — it fails outright. The gate rehearses Sprint 32's irreversible step before taking it.*

---

## Source Coverage

- UC-PLAT-01, UC-PLAT-02, UC-PLAT-03, UC-PLAT-04, UC-PLAT-05, UC-PLAT-06
- UC-DATA-01, UC-DATA-05
- UC-SVC-02, UC-SVC-03, UC-SVC-04, UC-SVC-05
- UC-INFER-01, UC-INFER-02, UC-INFER-03, UC-INFER-04
- UC-SYNC-01, UC-SYNC-02, UC-SYNC-03, UC-SYNC-04, UC-SYNC-05

## Capability Coverage

- CAP-MIG-01: content-level reconciliation, archive provenance, and the catalog-derived referential edge set the ETL must satisfy
- CAP-CUT-01: the 44-tool surface made executable on Postgres and the decommission-readiness inventory that gates deletion
- CAP-INF-01: real evidence into the deterministic gate, ASSAY≠CHALLENGE on resolved roles, probe-driven structuring, and telemetry on every fleet call
- CAP-BAK-01: restored backup execution, alert-sweep truth, and the scheduled fire drill
- CAP-SYNC-01: representable client error states and the proven airplane-mode read

---

## Blocks

- Sprint 32 (Convex Decommission) — no capability may be deleted before it has a working non-Convex replacement
