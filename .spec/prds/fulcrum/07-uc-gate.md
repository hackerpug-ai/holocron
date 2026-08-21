---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: GATE
---

# Use Cases: Missions & Human Gate (GATE)

MVP operator surface is generated Markdown (reads) and named CLI over mission APIs (writes). There is no RN screen and no "navigates." Loop health is a **section of the daily brief**.

| ID | Title | Description |
|----|-------|-------------|
| UC-GATE-01 | Define and edit a mission | A mission is a versioned fitness contract the operator authors and edits |
| UC-GATE-02 | Seed a mission's candidate pool | Bootstrap `candidates` from existing material |
| UC-GATE-03 | Issue verdicts with the stage machine | `holo fulcrum verdict` wrapping `POST /api/missions/:id/verdicts`; WIP=1; probe-gated validation |
| UC-GATE-04 | Generate the daily brief | A ≤5-minute intel drop with movers, nominations, kills, and a **Loop health** section |
| UC-GATE-05 | Open a candidate dossier | Markdown path / `holo fulcrum dossier <id>` — full evidence chain for one candidate |

---

## UC-GATE-01: Define and edit a mission

A mission is the loop's constitution: a root question plus a fitness contract (components with kinds and weights, domain-tier ladder, scope in/out, source rules and ban-list, courtesy delays, discovery cells, cadence rule, WIP limits, degradation ceiling). Mission #1 is `dev-revenue`. Editing the contract is how the operator steers the loop — no code change. Ban-list and courtesy delays are Zod fields enforced by the retrieval client (UC-CYC-04).

**Acceptance Criteria**
- ☐ Operator can create a mission by declaring its root question and fitness contract
- ☐ Operator can edit a mission's weights, tier ladder, scope, source rules (including ban-list + courtesy delays), and discovery cells and have the next cycle honor them
- ☐ System reads the mission contract at the start of every cycle so a mid-run edit takes effect on the following cycle
- ☐ Operator can create a second mission (a different goal) without changing engine code
- ☐ System versions mission-contract changes so a `belief_scores` row references the contract version in force when it was computed

---

## UC-GATE-02: Seed a mission's candidate pool

A new mission does not start empty. The operator imports existing material — captured needs, prior opportunity notes, existing holocron research — as seed `candidates` the first cycles begin deepening.

**Acceptance Criteria**
- ☐ Operator can import a set of seed items into a mission as initial `candidates` (`holo fulcrum seed`)
- ☐ System creates a candidate (with initial provisional claims where source material exists) for each seed
- ☐ System makes seeded candidates eligible for work-item selection so the first cycles operate on them
- ☐ Operator can see the seeded candidates listed for the mission before any cycle runs (brief / dossier Markdown)

---

## UC-GATE-03: Issue verdicts with the stage machine

The operator advances candidates only through **`holo fulcrum verdict <runId> <kill|advance|redirect|boost>`**, which wraps **`POST /api/missions/:id/verdicts`** (already exists) and writes a `mission_verdicts` row plus a `touches` row. Kills must cite a ledger claim. `advance → validated` requires a recorded reality-probe result (`probes` row via `holo fulcrum probe` — recording in scope, tooling out). Only one candidate may be in active build (**WIP = 1**).

**Acceptance Criteria**
- ☐ Operator can issue kill / advance / redirect / boost verdicts against a candidate via `holo fulcrum verdict`, which calls `POST /api/missions/:id/verdicts`
- ☐ System requires a cited ledger claim for a kill and rejects an uncited kill
- ☐ System refuses to advance a second candidate into active build while one already occupies it (WIP=1)
- ☐ System refuses `advance → validated` unless a human reality-probe result has been recorded as a `probes` row for that candidate
- ☐ System records every verdict as the operator's calibration signal, distinguishing fit verdicts from validity verdicts
- ☐ System retires a candidate on kill while preserving its ledger and lineage, and writes its strongest disconfirming claim as a queryable closeout

---

## UC-GATE-04: Generate the daily brief

A generated, ≤5-minute brief is the operator's daily touchpoint, written to `.holocron/fulcrum/briefs/{YYYY-MM-DD}.md` and published via `publishDocumentForRun`. It contains score movers (with the claims that moved them), at most three nominations (top candidates plus at least one discovery wildcard), retired-this-cycle with cited reasons, coverage, unclassified domains awaiting tiering, and a section titled **Loop health** (budget/breaker, diverge/converge counts, per-role availability).

**Acceptance Criteria**
- ☐ System can generate a daily brief from current ledger state showing score movers and the claims responsible
- ☐ System caps nominations at three and always includes at least one discovery-sourced candidate among them
- ☐ System shows candidates retired since the last brief with the cited reason for each
- ☐ System shows coverage (cells swept), domains awaiting tiering, and a **Loop health** section covering budget/breaker state and fleet/degradation state per role
- ☐ Operator can acknowledge the brief with **`holo fulcrum ack-brief <runId> <briefId>`** (`ackBrief`), which `POST`s `/api/missions/:id/touches` and inserts a `touches` row with `touch_type='brief_ack'` that resets the degradation ceiling; a file read of the brief does not count as a touch
- ☐ System drops the loop to sense-only when no explicit touch occurs within the mission's degradation ceiling, and reports it in **Loop health**

---

## UC-GATE-05: Open a candidate dossier

For any candidate, the operator can read its full evidence chain as Markdown at `.holocron/fulcrum/dossiers/{candidateId}.md`, or print it with `holo fulcrum dossier <candidateId>`. The daily brief links to that path. There is no in-app navigation.

**Acceptance Criteria**
- ☐ Operator can view a candidate dossier showing every claim with its bound evidence, source, grade, and admission status
- ☐ System shows the score broken down by component with each component's contributing claims and any UNKNOWN components
- ☐ System shows the candidate's lineage (what it derived from and which evidence delta caused each change) and its open disconfirmation questions
- ☐ System regenerates a dossier on material change so it reflects the latest committed cycle
- ☐ Operator can reach a candidate's dossier from its entry in the daily brief by following the Markdown path or running `holo fulcrum dossier <id>`
