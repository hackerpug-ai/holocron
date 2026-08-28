---
sprint: 1
sequence: 1
slug: produce-one-trustworthy-candidate-dossier-on-self-owned-inference
timeline: Phase 1
status: In Progress
fidelity: committed
prd: .spec/prds/fulcrum/README.md
roadmap: .spec/prds/fulcrum/ROADMAP.md
planned_from_roadmap_sha: a7e465c134bdd377886cd60c17c4852ef4bdce94675ebeb967825ab8ba8b8f3f
planned_from_source_sha: 6017eebcecfb2bbb8601ac9b61e29fc1ac9f76f5
source_kind: git-head
planned_at: 2026-08-28T06:06:27Z
planned_by: kb-sprint-tasks-plan v4.8
proposed_by: mastra-planner + devops-engineer
task_count: 15
points_total: 69
---

# Sprint 01: Produce one trustworthy candidate dossier on self-owned inference

**Status:** In Progress
> Progress: 0/15 tasks completed · updated 2026-08-28T07:00:59Z
**Sequence:** 1
**Timeline:** Phase 1
**Fidelity:** committed
**Proposed by:** mastra-planner + devops-engineer

## Overview

Fulcrum's first vertical slice: one legal mission invocation runs a complete, fixed-budget research
cycle end to end on holocron's self-owned local inference substrate, and returns a candidate dossier
whose every claim survived the deterministic evidence gate.

The slice stands up the substrate (compliant `divergent` / `convergent` / `embed` roles on both
inference minis, load-balanced by an image-local LiteLLM router), the append-only Fulcrum ledger in
Postgres, the deterministic admission → independence → quote-verification → scoring chain, one
governed corpus fetch, router-truthful inference attestation, the typed cycle, atomic commit with
idempotent replay, dossier rendering, idempotent publish + 1024-dim embedding, and the `holo fulcrum`
CLI surface that returns it all.

Nothing self-certifies. The evidence gate is a pure deterministic module — agents produce claims,
they never judge them — and the human gate below owns the done-bit.

## Human Testing Gate

**Gate:** Running `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'` against the deployed platform returns the literal values `status=committed`, `template=evidence-research`, and `admission=admitted` with non-empty `candidate_id` and `dossier_path` values.

**Entrypoint:** `holo fulcrum '<goal>'`

**Before (RED at sprint start):** The existing Fulcrum alias can invoke inherited evidence-research
behavior, but no deployed path can route the complete Fulcrum cycle through compliant local roles,
persist the Fulcrum ledger and deterministic gate, atomically commit the result, or return an
admitted candidate dossier.

**Demonstrates:** UC-LIS-01, UC-LIS-02, UC-CYC-01, UC-CYC-04, UC-LED-02, UC-LED-03, UC-LED-04, UC-LED-05

## Human Test Deliverable

A stranger, given only the steps below, can run the deployed platform and watch one goal become one
admitted, quote-verified, scored, published candidate dossier — and can watch the same command
refuse to fake it when the budget is exhausted or the claims are canned.

### Test Steps

*(as many as coverage requires — no numeric cap; each runnable by a stranger verbatim)*

1. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin'` with real Postgres, the real corpus, and the deployed local inference fleet — the command prints `status=committed`, `template=evidence-research`, `admission=admitted`, a non-empty `candidate_id`, and a non-empty `dossier_path`.
   `exercises: FUL-INFRA-001, FUL-INFRA-002, FUL-PLAT-001, FUL-PLAT-005, FUL-PLAT-006, FUL-PLAT-007, FUL-PLAT-008, FUL-PLAT-009, FUL-PLAT-012`
2. Open the generated `.holocron/fulcrum/dossiers/{candidateId}.md` surface named by `dossier_path` — it contains the literal values `Admission: admitted` and `Verified quote: true`, a non-empty numeric `Belief score`, a non-empty `Domain tier version`, a verbatim quote, its source URL, requested roles `divergent` and `convergent`, distinct non-empty resolved model identities, a serving backend of `inference1` or `inference2` for every chat stage, and `Embedding dimensions: 1024`.
   `exercises: FUL-INFRA-001, FUL-INFRA-002, FUL-PLAT-001, FUL-PLAT-002, FUL-PLAT-003, FUL-PLAT-004, FUL-PLAT-007, FUL-PLAT-010, FUL-PLAT-011, FUL-PLAT-012`
3. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --idempotency-key fulcrum-human-gate-01 --json` twice — the second response contains `"replay":true` and returns the same non-empty `runId`, `candidateId`, and `dossierPath` as the first response.
   `exercises: FUL-PLAT-009, FUL-PLAT-011, FUL-PLAT-012`
4. Run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --budget-usd 0.000001 --fresh --json` — the response contains `"status":"budget_exceeded"` and contains no `candidateId` or `dossierPath`.
   `exercises: FUL-PLAT-008, FUL-PLAT-009, FUL-PLAT-012`
5. Create `/tmp/fulcrum-canned.json` containing `[{"claim":"invented success"}]`, then run `holo fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --claims /tmp/fulcrum-canned.json --fresh --json` — the response contains `"errorCode":"FULCRUM_CORPUS_ONLY"` and contains no `candidateId` or `dossierPath`.
   `exercises: FUL-PLAT-006, FUL-PLAT-012`

**Dark tasks:** FUL-INFRA-003 (8 pts) — No stranger-verbatim product step invokes a test runner,
fault injector, or evaluation harness. This task is intentionally dark because it independently
rejects false product success against real services. It is 8 of 69 committed points, or 11.6%,
below the 30% ceiling.

## Tasks

| ID | Title | Agent | Points | Wave | Status |
|----|-------|-------|--------|------|--------|
| FUL-INFRA-001 | Provision compliant Fulcrum roles on both inference minis | devops-engineer | 5 | A | ⬜ Pending |
| FUL-PLAT-001 | Install the append-only Fulcrum ledger contract | mastra-implementer | 5 | A | ⬜ Pending |
| FUL-INFRA-002 | Embed the Fulcrum LiteLLM router in the platform image | devops-engineer | 5 | B | ⬜ Pending |
| FUL-PLAT-002 | Decide deterministic claim admission | mastra-implementer | 5 | B | ⬜ Pending |
| FUL-PLAT-005 | Compile the versioned Fulcrum mission contract | mastra-implementer | 3 | B | ⬜ Pending |
| FUL-PLAT-003 | Enforce provenance independence | mastra-implementer | 3 | C | ⬜ Pending |
| FUL-PLAT-006 | Retrieve one governed corpus fetch artifact | mastra-implementer | 5 | C | ⬜ Pending |
| FUL-PLAT-007 | Attest every Fulcrum inference call from router-truthful metadata | mastra-implementer | 5 | C | ⬜ Pending |
| FUL-PLAT-004 | Compute the deterministic belief score | mastra-implementer | 3 | D | ⬜ Pending |
| FUL-PLAT-008 | Execute the typed Fulcrum cycle | mastra-implementer | 8 | E | ⬜ Pending |
| FUL-PLAT-009 | Commit the cycle atomically and replay safely | mastra-implementer | 5 | F | ⬜ Pending |
| FUL-PLAT-010 | Render the committed candidate dossier | mastra-implementer | 3 | G | ⬜ Pending |
| FUL-PLAT-011 | Publish and embed the dossier idempotently | mastra-implementer | 3 | H | ⬜ Pending |
| FUL-PLAT-012 | Return the committed dossier through the Fulcrum CLI | mastra-implementer | 3 | I | ⬜ Pending |
| FUL-INFRA-003 | Verify the dossier with real-service playback and evals | devops-engineer | 8 | J | ⬜ Pending |

**Waves:** A(2) → B(3) → C(3) → D(1) → E(1) → F(1) → G(1) → H(1) → I(1) → J(1) — 10 waves over 15 tasks
**Total:** 69 points

## Capability Coverage

- **CAP-COMMIT-01** — One legal mission invocation produces a complete transactional cycle result, while budget failure and idempotent replay produce explicit non-partial outcomes.
- **CAP-INFER-01** — The cycle uses the image-local router and only divergent, convergent, and embed across the minis, with actual serving identity proven from response headers plus `/model/info`.
- **CAP-EVIDENCE-01** — A named corpus fetch artifact becomes an exact verified quote, recorded admission decision, independence result, and deterministic version-stamped score.
- **CAP-PUBLISH-01** — The committed dossier is generated, idempotently published through the inherited document path, embedded at 1024 dimensions, and marked self-sourced for later retrieval.

## Source Coverage

- `README.md`
- `00-overview.md`
- `01-scope.md`
- `02-roles.md`
- `03-functional-groups.md`
- `04-uc-lis.md`: UC-LIS-01, UC-LIS-02
- `05-uc-cyc.md`: UC-CYC-01, UC-CYC-04
- `06-uc-led.md`: UC-LED-02, UC-LED-03, UC-LED-04, UC-LED-05
- `08-team-contributions.md`: Mastra/backend and devops/inference contributions
- `09-technical-requirements/00-architecture-decisions.md`
- `09-technical-requirements/01-architecture-posture.md`
- `09-technical-requirements/02-system-components.md`
- `09-technical-requirements/03-data-schema.md`
- `09-technical-requirements/04-api-design.md`
- `09-technical-requirements/05-architecture-diagram.md`
- `09-technical-requirements/06-external-dependencies.md`
- `09-technical-requirements/07-technical-risks.md`
- `09-technical-requirements/08-capability-chains.md`: CAP-COMMIT-01, CAP-INFER-01, CAP-EVIDENCE-01, CAP-PUBLISH-01
- `09-technical-requirements/09-e2e-testing.md`
- `09-technical-requirements/README.md`
- `10-e2e-testing-criteria.md`: T-LIS-001 through T-LIS-008, T-LIS-022, T-LIS-027; T-CYC-001 through T-CYC-005, T-CYC-014 through T-CYC-017; T-LED-006 through T-LED-022

## Blocks

- Blocks: Sprint 02, Sprint 03, Sprint 04, Sprint 05
- Dependent on: None

## Task Detail Files

Generated by `/kb-sprint-tasks-plan` on 2026-08-28T06:06:27Z — 15 tasks, 75 ACs, 122 TCs,
197 tracked requirements. Fakeability audit: `validate_scenario` exit 0, 75 scenarios, 0 violations.

- FUL-INFRA-001-provision-compliant-fulcrum-roles-on-both-inference-minis.md
- FUL-PLAT-001-install-the-append-only-fulcrum-ledger-contract.md
- FUL-INFRA-002-embed-the-fulcrum-litellm-router-in-the-platform-image.md
- FUL-PLAT-002-decide-deterministic-claim-admission.md
- FUL-PLAT-005-compile-the-versioned-fulcrum-mission-contract.md
- FUL-PLAT-003-enforce-provenance-independence.md
- FUL-PLAT-006-retrieve-one-governed-corpus-fetch-artifact.md
- FUL-PLAT-007-attest-every-fulcrum-inference-call-from-router-truthful-metadata.md
- FUL-PLAT-004-compute-the-deterministic-belief-score.md
- FUL-PLAT-008-execute-the-typed-fulcrum-cycle.md
- FUL-PLAT-009-commit-the-cycle-atomically-and-replay-safely.md
- FUL-PLAT-010-render-the-committed-candidate-dossier.md
- FUL-PLAT-011-publish-and-embed-the-dossier-idempotently.md
- FUL-PLAT-012-return-the-committed-dossier-through-the-fulcrum-cli.md
- FUL-INFRA-003-verify-the-dossier-with-real-service-playback-and-evals.md

### Planning notes carried forward

- `services/platform/src/cli/holo.ts` is written by four tasks in waves A, B, I and J — sequential,
  never parallel, but it is a shared 3,800-line file.
- `FUL-PLAT-005` (3 pts) is the only task editing a shared file: it widens `toolGrants` in
  `services/platform/src/mission/contract.ts` from `z.array(z.never())` to a closed enum so SENSE's
  corpus tool ids become representable. Backward-compatible (five shipped templates pass `[]`), but
  the blast radius is the whole integration lane.
- `services/platform/src/mission/runtime.ts:342-398` currently verifies a quote against the same
  280-char buffer it sliced the quote from — the anti-fabrication guard cannot fail today, so the
  gate's `Verified quote: true` is presently unearned. Named as an explicit anti-pattern on
  `FUL-PLAT-002` and `FUL-PLAT-006`, with negative controls that go RED on it.
- `judge` stays in the shared platform fleet manifest. `FUL-INFRA-001` publishes a separate, narrower
  Fulcrum vocabulary at `services/platform/deploy/fleet/fulcrum-roles.json`; ADR-008 forbids `judge`
  for Fulcrum only, and non-Fulcrum platform paths still depend on it.
