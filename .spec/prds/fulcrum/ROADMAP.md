---
roadmap: 1
project: "Fulcrum — Autonomous Research Loop"
generated: 2026-08-26T00:59:47Z
prd: .spec/prds/fulcrum/README.md
sprint_count: 5
commit_horizon: 1
pr_sequencing: true
---

# Sprint Roadmap: Fulcrum — Autonomous Research Loop

## Overview

**Sprints:** 5  (1 committed · 4 provisional)
**Total Tasks:** 15  (committed sprints only; provisional sprints carry a size band)
**Current Sprint:** Sprint 01 — tasks expanded 2026-08-28; 15 task files under `tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/`

> **PR sequencing enabled.** Lifecycle: 🔵 Planned → 🟠 In flight → 🟣 In review → ✅ Completed → 🔴 Blocked. PR cell required for Completed status. See [`~/Projects/brain/docs/PR-SEQUENCING.md`](~/Projects/brain/docs/PR-SEQUENCING.md) for the full convention.

## Sprint Sequence

| # | Milestone | Sprint | Gate | Tasks | Dependencies | Status | Branch | PR |
|---|-----------|--------|------|-------|--------------|--------|--------|----|
| 1 | — | [Sprint 01: Produce one trustworthy candidate dossier on self-owned inference](#sprint-01-real-evidence-dossier) | Running `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'` against the deployed platform returns the literal values `status=committed`, `template=evidence-research`, and `admission=admitted` with non-empty `candidate_id` and `dossier_path` values. | 15 | — | 🟠 In flight | `—` | — |
| 2 | — | [Sprint 02: Wake to a resilient evidence brief](#sprint-02-resilient-daily-brief) | The generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` surface contains non-empty `Movers`, `Seed pool`, `Discovery wildcard`, `Retired this cycle`, and `Loop health` sections, links to a regenerated dossier, identifies an aged or boosted item selected by the loop, attributes a later admitted refutation to its queued kill-question, reports every inference role and serving backend, and shows the literal value `Cloud fallback: disabled` after real degradation and restart playback. | — | Sprint 01 | 🟠 In flight | `—` | — |
| 3 | — | [Sprint 03: Change mission policy without losing score history](#sprint-03-versioned-mission-policy) | Running `holo fulcrum '<goal>'` for a mission whose versioned contract adds a previously missing domain tier returns `status=committed` and a non-empty `dossier_path`, and the generated dossier shows the formerly provisional evidence admitted under non-empty `Contract version`, `Domain tier version`, and `Weight version` values while preserving non-empty `Prior score` and `Current score` entries. | — | Sprint 02 | 🔵 Planned | `—` | — |
| 4 | — | [Sprint 04: Compare a local model swap on identical evidence](#sprint-04-measured-role-binding) | The generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` surface contains a non-empty `Binding comparison` naming both resolved bindings and showing `ASSAY attempts: 20 or more`, `CHALLENGE attempts: 10 or more`, quote-check pass rate, refuting-claim gate-pass rate, later admitted-disconfirm rate, and the literal state `insufficient_n` whenever a required denominator is not met. | — | Sprint 03 | 🔵 Planned | `—` | — |
| 5 | — | [Sprint 05: Advance or retire a candidate with enforced evidence](#sprint-05-governed-operator-verdict) | Using `holo fulcrum verdict <runId> <kill|advance|redirect|boost>` across candidates with and without cited claims, persisted probes, and an existing active build returns the literal accepted or rejection status required by each transition, preserves WIP=1, and produces a non-empty retirement closeout for an accepted kill. | — | Sprint 04 | 🔵 Planned | `—` | — |

---

## Per-Sprint Details

### Sprint 01: Produce one trustworthy candidate dossier on self-owned inference

**Sequence:** 1
**Timeline:** Phase 1
**Status:** In Progress
**Fidelity:** committed
**Proposed by:** mastra-planner + devops-engineer
**Milestone:** —
**Branch:** `—`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'` against the deployed platform returns the literal values `status=committed`, `template=evidence-research`, and `admission=admitted` with non-empty `candidate_id` and `dossier_path` values.
**Entrypoint:** holo fulcrum '<goal>'
**Before:** The existing Fulcrum alias can invoke inherited evidence-research behavior, but no deployed path can route the complete Fulcrum cycle through compliant local roles, persist the Fulcrum ledger and deterministic gate, atomically commit the result, or return an admitted candidate dossier.
**Demonstrates:** UC-LIS-01, UC-LIS-02, UC-CYC-01, UC-CYC-04, UC-LED-02, UC-LED-03, UC-LED-04, UC-LED-05

**Test Steps:** *(as many as coverage requires — no numeric cap; each runnable by a stranger verbatim)*
1. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'` with real Postgres, the real corpus, and the deployed local inference fleet — the command prints `status=committed`, `template=evidence-research`, `admission=admitted`, a non-empty `candidate_id`, and a non-empty `dossier_path`.   `exercises: FUL-INFRA-001, FUL-INFRA-002, FUL-PLAT-001, FUL-PLAT-005, FUL-PLAT-006, FUL-PLAT-007, FUL-PLAT-008, FUL-PLAT-009, FUL-PLAT-012`
2. Open the generated `.holocron/fulcrum/dossiers/{candidateId}.md` surface named by `dossier_path` — it contains the literal values `Admission: admitted` and `Verified quote: true`, a non-empty numeric `Belief score`, a non-empty `Domain tier version`, a verbatim quote, its source URL, requested roles `divergent` and `convergent`, distinct non-empty resolved model identities, a serving backend of `inference1` or `inference2` for every chat stage, and `Embedding dimensions: 1024`.   `exercises: FUL-INFRA-001, FUL-INFRA-002, FUL-PLAT-001, FUL-PLAT-002, FUL-PLAT-003, FUL-PLAT-004, FUL-PLAT-007, FUL-PLAT-010, FUL-PLAT-011, FUL-PLAT-012`
3. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` twice — the second response contains `"replay":true` and returns the same non-empty `runId`, `candidateId`, and `dossierPath` as the first response.   `exercises: FUL-PLAT-009, FUL-PLAT-011, FUL-PLAT-012`
4. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json` — the response contains `"status":"budget_exceeded"` and contains no `candidateId` or `dossierPath`.   `exercises: FUL-PLAT-008, FUL-PLAT-009, FUL-PLAT-012`
5. Create `/tmp/fulcrum-canned.json` containing `[{"claim":"invented success"}]`, then run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json` — the response contains `"errorCode":"FULCRUM_CORPUS_ONLY"` and contains no `candidateId` or `dossierPath`.   `exercises: FUL-PLAT-006, FUL-PLAT-012`

**Dark tasks:** FUL-INFRA-003 (8 pts) — No stranger-verbatim product step invokes a test runner, fault injector, or evaluation harness. This task is intentionally dark because it independently rejects false product success against real services. It is 8 of 69 committed points, or 11.6%, below the 30% ceiling.

#### Tasks

| ID | Title | Agent | Points | Wave | Status |
| ---- | ------- | ------- | -------- | ------ | -------- |
| FUL-INFRA-001 | Provision compliant Fulcrum roles on both inference minis | devops-engineer | 5 | A | ✅ Completed |
| FUL-INFRA-002 | Embed the Fulcrum LiteLLM router in the platform image | devops-engineer | 5 | B | ⬜ Pending |
| FUL-PLAT-001 | Install the append-only Fulcrum ledger contract | mastra-implementer | 5 | A | ✅ Completed |
| FUL-PLAT-002 | Decide deterministic claim admission | mastra-implementer | 5 | B | ⬜ Pending |
| FUL-PLAT-003 | Enforce provenance independence | mastra-implementer | 3 | C | ⬜ Pending |
| FUL-PLAT-004 | Compute the deterministic belief score | mastra-implementer | 3 | D | ⬜ Pending |
| FUL-PLAT-005 | Compile the versioned Fulcrum mission contract | mastra-implementer | 3 | B | ⬜ Pending |
| FUL-PLAT-006 | Retrieve one governed corpus fetch artifact | mastra-implementer | 5 | C | ⬜ Pending |
| FUL-PLAT-007 | Attest every Fulcrum inference call from router-truthful metadata | mastra-implementer | 5 | C | ⬜ Pending |
| FUL-PLAT-008 | Execute the typed Fulcrum cycle | mastra-implementer | 8 | E | ⬜ Pending |
| FUL-PLAT-009 | Commit the cycle atomically and replay safely | mastra-implementer | 5 | F | ⬜ Pending |
| FUL-PLAT-010 | Render the committed candidate dossier | mastra-implementer | 3 | G | ⬜ Pending |
| FUL-PLAT-011 | Publish and embed the dossier idempotently | mastra-implementer | 3 | H | ⬜ Pending |
| FUL-PLAT-012 | Return the committed dossier through the Fulcrum CLI | mastra-implementer | 3 | I | ⬜ Pending |
| FUL-INFRA-003 | Verify the dossier with real-service playback and evals | devops-engineer | 8 | J | ⬜ Pending |

**Waves:** A(2) → B(3) → C(3) → D(1) → E(1) → F(1) → G(1) → H(1) → I(1) → J(1) — 10 waves over 15 tasks

**Next Sprint Tasks:** *(generated 2026-08-28T06:06:27Z by `/kb-sprint-tasks-plan` — 15 tasks, 75 ACs, 122 TCs, 197 tracked requirements; validate_scenario exit 0 / 0 violations)*
- FUL-INFRA-001-provision-compliant-fulcrum-roles-on-both-inference-minis.md
- FUL-INFRA-002-embed-the-fulcrum-litellm-router-in-the-platform-image.md
- FUL-PLAT-001-install-the-append-only-fulcrum-ledger-contract.md
- FUL-PLAT-002-decide-deterministic-claim-admission.md
- FUL-PLAT-003-enforce-provenance-independence.md
- FUL-PLAT-004-compute-the-deterministic-belief-score.md
- FUL-PLAT-005-compile-the-versioned-fulcrum-mission-contract.md
- FUL-PLAT-006-retrieve-one-governed-corpus-fetch-artifact.md
- FUL-PLAT-007-attest-every-fulcrum-inference-call-from-router-truthful-metadata.md
- FUL-PLAT-008-execute-the-typed-fulcrum-cycle.md
- FUL-PLAT-009-commit-the-cycle-atomically-and-replay-safely.md
- FUL-PLAT-010-render-the-committed-candidate-dossier.md
- FUL-PLAT-011-publish-and-embed-the-dossier-idempotently.md
- FUL-PLAT-012-return-the-committed-dossier-through-the-fulcrum-cli.md
- FUL-INFRA-003-verify-the-dossier-with-real-service-playback-and-evals.md

#### Dependencies

- Blocks: Sprint 02, Sprint 03, Sprint 04, Sprint 05
- Dependent on: None

#### PRD Coverage

- README.md
- 00-overview.md
- 01-scope.md
- 02-roles.md
- 03-functional-groups.md
- 04-uc-lis.md: UC-LIS-01, UC-LIS-02
- 05-uc-cyc.md: UC-CYC-01, UC-CYC-04
- 06-uc-led.md: UC-LED-02, UC-LED-03, UC-LED-04, UC-LED-05
- 08-team-contributions.md: Mastra/backend and devops/inference contributions
- 09-technical-requirements/00-architecture-decisions.md
- 09-technical-requirements/01-architecture-posture.md
- 09-technical-requirements/02-system-components.md
- 09-technical-requirements/03-data-schema.md
- 09-technical-requirements/04-api-design.md
- 09-technical-requirements/05-architecture-diagram.md
- 09-technical-requirements/06-external-dependencies.md
- 09-technical-requirements/07-technical-risks.md
- 09-technical-requirements/08-capability-chains.md: CAP-COMMIT-01, CAP-INFER-01, CAP-EVIDENCE-01, CAP-PUBLISH-01
- 09-technical-requirements/09-e2e-testing.md
- 09-technical-requirements/README.md
- 10-e2e-testing-criteria.md: T-LIS-001 through T-LIS-008, T-LIS-022, T-LIS-027; T-CYC-001 through T-CYC-005, T-CYC-014 through T-CYC-017; T-LED-006 through T-LED-022

#### Capability Coverage

- CAP-COMMIT-01: One legal mission invocation produces a complete transactional cycle result, while budget failure and idempotent replay produce explicit non-partial outcomes.
- CAP-INFER-01: The cycle uses the image-local router and only divergent, convergent, and embed across the minis, with actual serving identity proven from response headers plus `/model/info`.
- CAP-EVIDENCE-01: A named corpus fetch artifact becomes an exact verified quote, recorded admission decision, independence result, and deterministic version-stamped score.
- CAP-PUBLISH-01: The committed dossier is generated, idempotently published through the inherited document path, embedded at 1024 dimensions, and marked self-sourced for later retrieval.

---

### Sprint 02: Wake to a resilient evidence brief

**Sequence:** 2
**Timeline:** Phase 2
**Status:** 🔵 Planned
**Fidelity:** provisional
**Proposed by:** mastra-planner + devops-engineer
**Milestone:** —
**Branch:** `—`
**PR:** —

#### Human Testing Gate

**Gate:** The generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` surface contains non-empty `Movers`, `Seed pool`, `Discovery wildcard`, `Retired this cycle`, and `Loop health` sections, links to a regenerated dossier, identifies an aged or boosted item selected by the loop, attributes a later admitted refutation to its queued kill-question, reports every inference role and serving backend, and shows the literal value `Cloud fallback: disabled` after real degradation and restart playback.
**Entrypoint:** generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md`
**Before:** No Fulcrum selector, diverge/deepen cadence, challenge follow-up loop, leased cadence job, degradation controller, touch ceiling, daily brief, acknowledgement behavior, aggregate inference telemetry, or brief-to-dossier journey exists.
**Demonstrates:** UC-LIS-04, UC-LIS-05, UC-CYC-02, UC-CYC-03, UC-CYC-05, UC-CYC-06, UC-GATE-02, UC-GATE-04, UC-GATE-05

**Sizing (provisional):** ~11 items · ~55-89 pts — This vertical slice adds the EVoI selector with anti-starvation and boost handling, discovery/deepening cadence, repeated CHALLENGE follow-up, leased scheduler row, budget and thermal breakers, one- and two-mini degradation, restart recovery, aggregate telemetry, brief and dossier regeneration, seed-pool presentation, touch ceiling, acknowledgement, and real outage/restart playback.

> Test steps and the task table are authored when this sprint becomes next
> (`/kb-sprint-tasks-plan`), against the codebase as it is then. See
> [`~/Projects/brain/docs/COMMIT-HORIZON.md`](~/Projects/brain/docs/COMMIT-HORIZON.md).

#### Dependencies

- Blocks: Sprint 03, Sprint 04, Sprint 05
- Dependent on: Sprint 01

#### PRD Coverage

- 03-functional-groups.md: Local Inference Substrate, Cycle Loop Engine, Missions and Human Gate
- 04-uc-lis.md: UC-LIS-04, UC-LIS-05
- 05-uc-cyc.md: UC-CYC-02, UC-CYC-03, UC-CYC-05, UC-CYC-06
- 07-uc-gate.md: UC-GATE-02, UC-GATE-04, UC-GATE-05
- 09-technical-requirements/02-system-components.md
- 09-technical-requirements/04-api-design.md
- 09-technical-requirements/07-technical-risks.md
- 09-technical-requirements/08-capability-chains.md: CAP-COMMIT-01, CAP-INFER-01, CAP-PUBLISH-01
- 09-technical-requirements/09-e2e-testing.md
- 10-e2e-testing-criteria.md: T-LIS-015 through T-LIS-026; T-CYC-006 through T-CYC-013, T-CYC-018 through T-CYC-028; T-GATE-005, T-GATE-006, T-GATE-013 through T-GATE-023

#### Capability Coverage

- CAP-COMMIT-01: The leased `fulcrum:cycle` job selects work by the deterministic EVoI rule, resumes from Postgres after process death, and records explicit budget, breaker, touch-ceiling, or role-unavailable outcomes.
- CAP-INFER-01: One-mini loss uses only the surviving backend for the same role; two-mini loss produces explicit per-role reduced or skipped state without laptop, cloud, judge, or cross-role substitution.
- CAP-EVIDENCE-01: Discovery and deepening cycles admit support and refute claims under the same gate, preserve query history, and attribute a later admitted disconfirmation to its queued kill-question.
- CAP-PUBLISH-01: Material loop changes regenerate one daily brief and linked dossiers idempotently, and only explicit `ack-brief` writes the brief acknowledgement touch.

---

### Sprint 03: Change mission policy without losing score history

**Sequence:** 3
**Timeline:** Phase 3
**Status:** 🔵 Planned
**Fidelity:** provisional
**Proposed by:** mastra-planner + devops-engineer
**Milestone:** —
**Branch:** `—`
**PR:** —

#### Human Testing Gate

**Gate:** Running `holo fulcrum '<goal>'` for a mission whose versioned contract adds a previously missing domain tier returns `status=committed` and a non-empty `dossier_path`, and the generated dossier shows the formerly provisional evidence admitted under non-empty `Contract version`, `Domain tier version`, and `Weight version` values while preserving non-empty `Prior score` and `Current score` entries.
**Entrypoint:** holo fulcrum '<goal>'
**Before:** Fulcrum cannot yet create and edit versioned fitness contracts, run a second mission without engine code changes, re-assay an unclassified domain, append new scoring policy, preserve historical scores, or resurface retired candidates after deterministic rescoring.
**Demonstrates:** UC-LED-01, UC-LED-06, UC-GATE-01

**Sizing (provisional):** ~7 items · ~21-34 pts — The slice requires mission-folder authoring and validation, contract version publication, a second mission instantiation, deterministic domain re-assay, append-only weight and tier changes, inference-free bulk rescore, reconsideration logic, and dossier history presentation.

> Test steps and the task table are authored when this sprint becomes next
> (`/kb-sprint-tasks-plan`), against the codebase as it is then. See
> [`~/Projects/brain/docs/COMMIT-HORIZON.md`](~/Projects/brain/docs/COMMIT-HORIZON.md).

#### Dependencies

- Blocks: Sprint 04, Sprint 05
- Dependent on: Sprint 02

#### PRD Coverage

- 03-functional-groups.md: Evidence Ledger and Gate, Missions and Human Gate
- 06-uc-led.md: UC-LED-01, UC-LED-06
- 07-uc-gate.md: UC-GATE-01
- 09-technical-requirements/03-data-schema.md
- 09-technical-requirements/04-api-design.md
- 09-technical-requirements/08-capability-chains.md: CAP-EVIDENCE-01, CAP-COMMIT-01
- 10-e2e-testing-criteria.md: T-LED-001 through T-LED-005, T-LED-023 through T-LED-026; T-GATE-001 through T-GATE-004

#### Capability Coverage

- CAP-COMMIT-01: A second mission compiles from its versioned contract and runs through the same engine without a Fulcrum engine source edit.
- CAP-EVIDENCE-01: Adding a domain tier makes previously unclassified evidence gradeable on re-assay, while new contract, tier, weight, component, and score versions append without mutating history.
- CAP-PUBLISH-01: The regenerated dossier presents prior and current score history and a non-empty reconsideration item when a retired candidate now outranks its leader.

---

### Sprint 04: Compare a local model swap on identical evidence

**Sequence:** 4
**Timeline:** Phase 4
**Status:** 🔵 Planned
**Fidelity:** provisional
**Proposed by:** mastra-planner + devops-engineer
**Milestone:** —
**Branch:** `—`
**PR:** —

#### Human Testing Gate

**Gate:** The generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` surface contains a non-empty `Binding comparison` naming both resolved bindings and showing `ASSAY attempts: 20 or more`, `CHALLENGE attempts: 10 or more`, quote-check pass rate, refuting-claim gate-pass rate, later admitted-disconfirm rate, and the literal state `insufficient_n` whenever a required denominator is not met.
**Entrypoint:** generated `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md`
**Before:** Changing the model behind a role has no same-source comparison, denominator guard, deterministic quality oracle, kill-question outcome metric, source-diff detector, or durable binding history.
**Demonstrates:** UC-LIS-03

**Sizing (provisional):** ~6 items · ~21-34 pts — The slice adds binding snapshots, a version-pinned held-out source pack, router-only rebind workflow, deterministic denominator-gated metrics, source-diff and no-model-call detectors, binding persistence, and brief comparison rendering.

> Test steps and the task table are authored when this sprint becomes next
> (`/kb-sprint-tasks-plan`), against the codebase as it is then. See
> [`~/Projects/brain/docs/COMMIT-HORIZON.md`](~/Projects/brain/docs/COMMIT-HORIZON.md).

#### Dependencies

- Blocks: Sprint 05
- Dependent on: Sprint 03

#### PRD Coverage

- 04-uc-lis.md: UC-LIS-03
- 09-technical-requirements/00-architecture-decisions.md: model swap oracle
- 09-technical-requirements/06-external-dependencies.md
- 09-technical-requirements/07-technical-risks.md: model drift and curation
- 09-technical-requirements/08-capability-chains.md: CAP-INFER-01, CAP-EVIDENCE-01
- 10-e2e-testing-criteria.md: T-LIS-009 through T-LIS-014, T-LIS-028

#### Capability Coverage

- CAP-INFER-01: A router-config-only role rebind runs against identical held-out source material, records the actual resolved binding on every cycle, and requires no Fulcrum source edit or redeploy.
- CAP-EVIDENCE-01: Pure ledger-derived measurement reports quote-check, refuter admission, and later kill-question disconfirmation rates with the PRD denominator floors and no model call.
- CAP-PUBLISH-01: The daily brief presents both named bindings and all three comparable metrics side by side.

---

### Sprint 05: Advance or retire a candidate with enforced evidence

**Sequence:** 5
**Timeline:** Phase 5
**Status:** 🔵 Planned
**Fidelity:** provisional
**Proposed by:** mastra-planner + devops-engineer
**Milestone:** —
**Branch:** `—`
**PR:** —

#### Human Testing Gate

**Gate:** Using `holo fulcrum verdict <runId> <kill|advance|redirect|boost>` across candidates with and without cited claims, persisted probes, and an existing active build returns the literal accepted or rejection status required by each transition, preserves WIP=1, and produces a non-empty retirement closeout for an accepted kill.
**Entrypoint:** holo fulcrum verdict <runId> <kill|advance|redirect|boost>
**Before:** The inherited mission verdict route has reusable transaction and rejection primitives, but Fulcrum lacks the complete CLI journey, candidate-stage reducer, probe command integration, cited retirement closeout, boost-to-selector effect, and operator-visible distinction between fit and validity.
**Demonstrates:** UC-GATE-03

**Sizing (provisional):** ~7 items · ~21-34 pts — The slice adds the Fulcrum verdict and probe CLI contracts, candidate-stage transition reducer, citation and WIP enforcement integration, probe validation, boost selector handoff, closeout rendering, and real accepted/rejected operator journeys while reusing the inherited mission_verdicts transaction.

> Test steps and the task table are authored when this sprint becomes next
> (`/kb-sprint-tasks-plan`), against the codebase as it is then. See
> [`~/Projects/brain/docs/COMMIT-HORIZON.md`](~/Projects/brain/docs/COMMIT-HORIZON.md).

#### Dependencies

- Blocks: None
- Dependent on: Sprint 04

#### PRD Coverage

- 03-functional-groups.md: Missions and Human Gate
- 07-uc-gate.md: UC-GATE-03
- 09-technical-requirements/03-data-schema.md
- 09-technical-requirements/04-api-design.md
- 09-technical-requirements/08-capability-chains.md: CAP-GATE-01
- 09-technical-requirements/09-e2e-testing.md
- 10-e2e-testing-criteria.md: T-GATE-007 through T-GATE-012
- 10-e2e-testing-criteria.md: T-CYC-009

#### Capability Coverage

- CAP-GATE-01: The legal verdict and probe CLIs reach the inherited live API and Postgres transaction, issue all four verdicts, reject invalid transitions, require cited kill and probe-before-validation, enforce WIP=1, distinguish fit from validity, apply boost to selection, and preserve ledger lineage in retirement closeout.

---
