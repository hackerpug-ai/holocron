---
sprint: 3
title: MCP Compatibility Manifest and Frozen Fixtures
sequence: 3
timeline: Phase 0 — Leading INFRA
status: Completed
prd: ../../README.md
capability_coverage: [CAP-CUT-01]
---

# Sprint 3: MCP Compatibility Manifest and Frozen Fixtures

**Sequence:** 3
**Timeline:** Phase 0 — Leading INFRA
**Status:** In Progress
**Proposed by:** mcp-planner
**Branch:** `mk6-mcp-manifest`

---

## Overview

This is the third leading-INFRA sprint: it produces the **machine-readable migration-contract artifact** (`14-mcp-compatibility-manifest.yaml`) that freezes the current 44-tool MCP gateway's contract so the cutover (Sprint 19) can flip the gateway onto Postgres and prove byte-identical behavior. The manifest pins MCP protocol **2025-11-25**, declares both transports (existing stdio + Streamable HTTP), records the stateless / no-server-sampling capability policy and the auth/cancellation policy, and gives every one of the 44 registered tools a complete per-tool contract: input/output JSON Schemas, defaults, error code/data, ordering/pagination, side effects, idempotency/replay, supported transports, and frozen success/error fixtures. The mutation tools additionally carry a replay contract (idempotency key → stored result).

The sprint stands up the `holo mcp:*` operator surface: a completeness build-gate (`holo mcp:verify-manifest`) that cross-checks the manifest against the **live-registered** tool IDs and exits non-zero the moment a registered tool lacks a manifest entry (or a manifest entry names a tool that is no longer registered) — proving the manifest is grounded in the real registry, not a self-referential list of its own keys — plus operator inspection commands (`holo mcp:manifest-schema <tool>`, `holo mcp:manifest-replay <tool>`, `holo mcp:verify-manifest --protocol`, `holo mcp:list-mutations`). This manifest is the contract the Sprint 19 rehost flips against and that the generated contract tests compare registered tool IDs + behavior to, on both transports.

A gate is only real if it fails when the behavior is absent. The negative-control suite proves the completeness gate has teeth: remove one tool's fixture block and `holo mcp:verify-manifest` exits non-zero naming the uncovered tool; the RED evidence is captured against the absent/broken start before the full manifest goes green.

---

## Human Test Deliverable

An operator can prove — against the live MCP gateway registry and the committed `14-mcp-compatibility-manifest.yaml` — that all 44 registered tool IDs resolve to manifest entries carrying frozen success/error fixtures, that the completeness gate fails closed the moment a tool's fixture block is removed, and that each mutation tool carries a replay contract (idempotency key → stored result).

**Test Steps:**
1. Run `holo mcp:verify-manifest` — exits 0 reporting '44/44 tools, both transports covered'.
2. Remove one tool's fixture block, re-run `holo mcp:verify-manifest` — exits 1 naming the uncovered tool.
3. Run `holo mcp:manifest-schema store_document` — prints its input/output JSON Schema plus default values.
4. Run `holo mcp:manifest-replay add_subscription` — returns the frozen idempotency key and stored replay result.
5. Run `holo mcp:verify-manifest --protocol` — reports pinned MCP protocol 2025-11-25 for both transports.
6. Run `holo mcp:list-mutations` — lists the mutating tools including `store_document`, each with a replay-contract entry.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| mcp-manifest-01 | Author the MCP manifest header: protocol, transports, 44-tool skeleton | mcp-implementer | 90 min |
| mcp-manifest-02 | Populate per-tool contract for all 44 tools (schemas, defaults, errors, pagination, idempotency) | mcp-implementer | 150 min |
| mcp-manifest-03 | Freeze success/error/mutation-replay fixtures for all 44 tools from current behavior | red-test-generator | 180 min |
| mcp-manifest-04 | Build `holo mcp:verify-manifest` completeness gate + operator inspection commands | mcp-implementer | 120 min |
| mcp-manifest-05 | Review manifest protocol compliance; prove the completeness gate is un-fakeable | mcp-reviewer | 75 min |
| REDHAT-FIX-01 | Replace tautological replay fixture assertions with behavioral, real-tool replay proof | mcp-implementer | TBD |
| REDHAT-FIX-02 | Capture and validate fixtures from real tool behavior, including mutation error coverage | red-test-generator | TBD |
| REDHAT-FIX-03 | Make `holo mcp:verify-manifest` fail closed on all required contract fields and fixtures | mcp-implementer | TBD |

---

## Human Testing Gate

**Gate:** Running `holo mcp:verify-manifest` exits 0 after confirming all 44 live-registered tool IDs resolve to manifest entries carrying frozen success/error fixtures.

---

## Source Coverage

- UC-SVC-04 (AC-5) — MCP rehost & public endpoint: prove the MCP compatibility manifest covers every registered tool and both transports with frozen success/error fixtures and replay/idempotency tests for mutation tools
- `10-technical-requirements/12-migration-contract-artifacts.md` § "MCP compatibility manifest" — the per-tool contract shape (protocol 2025-11-25, both transports, no-server-sampling, per-tool schemas/defaults/errors/ordering/side-effects/idempotency/frozen fixtures)
- `10-technical-requirements/11-runtime-contracts.md` — runtime-contract posture (manifest-driven, fail-closed validation) this sprint mirrors
- T-SVC-021 (MCP compatibility manifest is complete: all 44 tools + both transports have frozen success/error fixtures; mutation tool replay contract is present)

## Capability Coverage

- CAP-CUT-01: the frozen 44-tool contract baseline the cutover (Sprint 19) flips to Postgres against

---

## Blocks

- Sprint 19 — MCP Gateway Rehost — 44 Tools on Postgres (the rehost flips the gateway against this frozen manifest; the generated contract tests compare registered tool IDs + behavior to the manifest on both transports)

**Dependent on:** Sprint 01 (Mastra compatibility lock + fleet role manifest — the `holo` operator CLI + the manifest-driven fail-closed posture established there)

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-14 (proposed by: mcp-planner [mcp-manifest-01, mcp-manifest-02, mcp-manifest-03, mcp-manifest-04, mcp-manifest-05])
Topological order: mcp-manifest-01 → mcp-manifest-02 → mcp-manifest-03 → mcp-manifest-04 → mcp-manifest-05 (manifest header/skeleton → per-tool contracts → frozen fixtures/RED controls → verify-manifest gate → review)

- mcp-manifest-01-author-mcp-manifest-header.md
- mcp-manifest-02-populate-per-tool-contracts.md
- mcp-manifest-03-freeze-fixtures-replay-contracts.md
- mcp-manifest-04-verify-manifest-completeness-gate.md
- mcp-manifest-05-review-protocol-compliance-unfakeable-gate.md

### Red-Hat Remediation Tasks (added 2026-07-14)

Generated by /kb-sprint-tasks-plan --only REDHAT-FIX-01,REDHAT-FIX-02,REDHAT-FIX-03 on 2026-07-14 (proposed by: mcp-planner; source: `.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md`)
Dependencies: REDHAT-FIX-01 (replay tests) and REDHAT-FIX-02 (fixture expansion) can run in parallel; REDHAT-FIX-03 (gate validation) is independent.

- REDHAT-FIX-01-replace-tautological-replay-fixture-assertions-with-behavioral-real-tool.md
- REDHAT-FIX-02-capture-and-validate-fixtures-from-real-tool-behavior.md
- REDHAT-FIX-03-make-holo-mcpverify-manifest-fail-closed-on-all-required.md
