---
sprint: 9
title: Structured Output on Local Models
sequence: 9
timeline: Phase 2 — Inference and Data
status: Completed
prd: ../../README.md
capability_coverage: [CAP-INF-01]
---

# Sprint 9: Structured Output on Local Models

**Sequence:** 9
**Timeline:** Phase 2 — Inference and Data
**Status:** Completed
> Progress: 4/4 tasks + cycle-1 REDHAT-FIX + cycle-2 C2-H1..H4 remediated · updated 2026-07-17T07:02:00Z
> Status-Note: Independent red-hat 2026-07-17T05-33-47Z H1-H4 closed; fresh human gate 6/6 pass; 44/44 PLATFORM_IT GREEN; met:true
**Proposed by:** mastra-planner
**Branch:** `mk6-structured-output`
**Opened:** 2026-07-16 — expanded by /kb-sprint-tasks-plan

---

## Overview

This is a Phase-2 Inference sprint that makes **structured extraction on the local fleet reliable and honest: schema-valid, or an explicit typed failure — never a silent acceptance of invalid output.** Sprint 01 already stood up the Fleet Role Manifest (the versioned `divergent`/`convergent`/`judge`/`embed`/`rerank` → `:4545` LiteLLM mapping with fail-closed startup validation), and Sprint 08 installed the `resolveModel(role, { allowEscape })` router that enforces local-first by default. What does **not** exist yet is the structured-output pipeline the entire migration's extraction surfaces assume: a single `extractStructured(schema, input, role)` path that drives `response_format` json_schema → backend constrained decoding → Mastra Zod re-validation → a **bounded** deterministic repair loop that fails explicitly past its cap. An extractor that *usually* returns valid JSON is not safe; an extractor that *cannot return an invalid object and proves it* is.

The sprint delivers four outcomes, each a later sprint's load-bearing assumption: (1) **the pipeline** — `extractStructured` composes `resolveModel(role)` (never bypassing the router or its default-deny escape), requests json_schema constrained decode, **re-validates every model output against the Zod schema at runtime** (Zod is truth, not the model), and on a parse failure enters a repair loop bounded by `MAX_REPAIR_ATTEMPTS`; (2) **the boot-time capability probe** — `holo probe:capabilities` probes each role endpoint with a **real** `generateObject` call (never a `/health` proxy or static cache) to record per-role json_schema support and select constrained-decode vs repair-loop mode; (3) the **RED suite** proving the never-silently-accept invariant bites — malformed→repair→valid, always-malformed→explicit `ExtractionFailedError` with no committed row, and tripwire→typed-terminal `BlockedError` with no tool dispatch; and (4) **adversarial review** confirming every extraction call site validates against a real Zod schema (no `z.any()`), the retry is capped, and no failure path commits.

Per Architecture Posture, the trust model is single-user tailnet — there is no RLS and no multi-tenant model. The control enforced here is the **never-silently-accept invariant**: the model output, the Zod validator, and the repair-cap are jointly the proof surface, not an authz boundary. The pipeline this sprint installs is the seam every downstream extraction surface composes: CAP-INF-01's research EXTRACT step (Sprint 17) and the unified agentic pipelines (Sprint 22) both call `extractStructured(schema, input, role)` and inherit its bounded repair, typed terminals, and default-deny escape.

---

## Human Test Deliverable

An operator can prove — with the Fleet Role Manifest, the `resolveModel` router, and the Mastra service from Sprints 01/05/08 — that `holo probe:capabilities` reports per-role json_schema support and selects constrained vs repair mode; that `holo extract --schema Foo --input good` returns a Zod-valid object; that `holo extract --fixture malformed-once` enters the bounded repair loop and yields a valid object; that `holo extract --fixture always-malformed` fails **explicitly** past the cap with a typed terminal error; that `holo extract:status <id>` reports `extraction_failed` with no committed row (no silent success); and that tripping an output tripwire during extraction emits a typed terminal `blocked` state with the tool not dispatched.

**Test Steps:**
1. Run `holo probe:capabilities` — reports per-role json_schema support and selects constrained vs repair mode.
2. Run `holo extract --schema Foo --input good` against the fleet — returns a Zod-valid object.
3. Run `holo extract --fixture malformed-once` — the bounded repair loop yields a valid object.
4. Run `holo extract --fixture always-malformed` — fails explicitly past the cap with a typed terminal error.
5. Self-contained extract→status pipeline (no hardcoded id):
   ```
   bun services/platform/src/cli/holo.ts extract --fixture always-malformed --json >/dev/null 2>&1 || true; \
   id=$(ls -t .tmp/extractions/*.json | head -1 | xargs -n1 basename | sed 's/\.json$//'); \
   bun services/platform/src/cli/holo.ts extract:status "$id" --json
   ```
   Oracle: `status.status === 'extraction_failed'` AND `status.committed === false` (file-based `.tmp/extractions` store; captures a fresh id at runtime — no prior-run dependency).
6. Trip an output tripwire during extraction — emits a typed terminal `blocked` state; the tool is not dispatched.

---

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| struct-1 | Structured-output pipeline: json_schema → constrained decode → Zod re-validate → bounded repair → explicit fail | mastra-implementer | 240 min |
| struct-2 | Boot-time per-role capability probe + typed terminal outcomes | mastra-implementer | 150 min |
| struct-3 | RED tests: malformed→repair→valid, always-malformed→explicit-fail, tripwire→blocked | red-test-generator | 150 min |
| struct-4 | Review extraction safety | mastra-reviewer | 75 min |
| REDHAT-FIX-H1 | Replace free-text generation with `generateObject` + `json_schema` constrained decoding | mastra-implementer | 180 min |
| REDHAT-FIX-H2 | Consume Fleet Role Manifest `structuredOutput` capability when selecting extraction mode | mastra-implementer | 120 min |
| REDHAT-FIX-H3 | Enforce output-side tripwire/processor guardrail before accepting model output | mastra-implementer | 120 min |
| REDHAT-FIX-H4 | Implement extraction status persistence and `holo extract:status` typed terminal reporting | mastra-implementer | 120 min |
| REDHAT-FIX-H5 | Restore durable struct-4 review report artifact with explicit verdict | mastra-reviewer | 45 min |
| REDHAT-FIX-H6 | Add real no-commit/no-dispatch assertions to failure-path tests | mastra-implementer | 90 min |
| REDHAT-FIX-H7 | Align capability-probe path and task scope contract | mastra-implementer | 45 min |
| REDHAT-FIX-G-DEFERRED | Make the six-step human gate reject deferred steps and keep met-state honest | mastra-implementer | 90 min |
| REDHAT-FIX-G-STEP3-4 | Add documented CLI fixture entry points for malformed-once and always-malformed scenarios | mastra-implementer | 90 min |
| REDHAT-FIX-G-ORACLE | Make capability-probe oracle distinguish constrained and repair-loop roles via real support probing | mastra-implementer | 90 min |
| REDHAT-FIX-C2-H1 | Redact sensitive tripwire matches from persisted status and CLI error payloads | mastra-implementer | 90 min |
| REDHAT-FIX-C2-H2 | Prove the output-side tripwire with clean input and deterministic sensitive model output | mastra-implementer | 120 min |
| REDHAT-FIX-C2-H3 | Make malformed-once deterministically enter repair and assert the successful repair attempt count | mastra-implementer | 120 min |
| REDHAT-FIX-C2-H4 | Make the extract-status gate step self-contained and reproducible from a clean checkout | mastra-implementer | 90 min |

---

## Human Testing Gate

**Gate:** Given a local fleet model and a Zod extraction schema, `holo extract` either repairs a malformed generation to a schema-valid object or fails explicitly past its retry cap with a typed terminal outcome — never silently accepting invalid output.

---

## Source Coverage

- UC-INFER-03 (Structured output on local models) — all three ACs: produce schema-valid structured extraction from a local model, repairing a malformed generation through a bounded loop and failing explicitly past the cap (never silently accepting), verified against the real fleet; probe each role endpoint at boot for json_schema support and select the appropriate structuring strategy; confirm every extraction call site validates against a Zod schema with a capped retry, and that a persistently-malformed generation or processor/tripwire block surfaces as an explicit typed terminal outcome with no unsafe commit.
- `07-uc-infer.md` — UC-INFER-03 acceptance criteria (the extraction pipeline, capability probe, and typed-terminal outcomes).
- `11-e2e-testing-criteria.md` — T-INFER-008 (schema-valid or explicit fail: malformed → bounded repair → valid, or explicit error past cap) · T-INFER-009 (boot-time capability probe selects constrained vs repair per role) · T-INFER-010 (every extraction Zod-validated with capped retry; malformed or tripwire output reaches a typed terminal outcome with no unsafe commit).
- `10-technical-requirements/09-capability-chains.md` — CAP-INF-01 (schema-valid-or-explicit-fail structuring on the local fleet — extraction segment).
- `10-technical-requirements/11-runtime-contracts.md` — the LiteLLM `:4545` fleet contract + the `@ai-sdk/openai` v6 `generateObject` / `responseFormat` json_schema runtime wiring.
- Sprint 01 (the Fleet Role Manifest — versioned role→`:4545` mapping + fail-closed startup validation + per-role capability surface) · Sprint 08 (the `resolveModel(role,{allowEscape})` router + default-deny escape that `extractStructured` composes — never bypassing the router).
- `services/platform/src/` (the `extractStructured` pipeline, the boot-time `probeRoleCapability`, the `holo extract` / `holo probe:capabilities` / `holo extract:status` operator commands, and the `struct-*` integration suite this sprint adds).

## Capability Coverage

- CAP-INF-01: schema-valid-or-explicit-fail structuring on the local fleet (extraction segment). This sprint owns the `extractStructured(schema, input, role)` pipeline seam — json_schema constrained decode, runtime Zod re-validation, bounded repair loop, and typed terminal outcomes (`ExtractionFailedError` / `BlockedError`) — plus the boot-time capability probe that selects constrained vs repair mode per role. The boundary contract every downstream extraction surface consumes: Sprint 17 (research EXTRACT step) and Sprint 22 (unified pipelines) call `extractStructured` and inherit never-silently-accept.

---

## Blocks

- Sprint 17 (Deterministic Research Engine — the research template's EXTRACT step calls `extractStructured`; ASSAY/CHALLENGE extraction depends on schema-valid-or-explicit-fail)
- Sprint 22 (All Agentic Pipelines as Templates — pipeline extraction composes `extractStructured`; no per-domain extraction shells)

**Dependent on:** Sprint 08 (the `resolveModel(role,{allowEscape})` router + default-deny escape that `extractStructured` composes) · Sprint 01 (the Fleet Role Manifest — versioned role→`:4545` mapping + per-role capability surface the boot probe reads).

---

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-16 (proposed by: mastra-planner).
Avg quality score: ~108/115 (115-point rubric, min 80). Fakeability audit: **0 CRITICAL / 0 HIGH** — `validate_scenario` clean (exit 0) on every behavioral AC across all 4 tasks (independently re-verified on the rendered files).
Topological order: struct-3 (RED suite, written first — proves the empty impl fails against the real seam) → struct-1 (extractStructured pipeline) ∥ struct-2 (boot-time capability probe) → struct-4 (adversarial review of struct-1/2/3).

- struct-1-structured-output-pipeline-bounded-repair-explicit-fail.md
- struct-2-boot-time-capability-probe-typed-terminals.md
- struct-3-red-tests-repair-explicit-fail-tripwire-blocked.md
- struct-4-review-extraction-safety.md
