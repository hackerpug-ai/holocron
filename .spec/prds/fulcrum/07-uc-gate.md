---
stability: FEATURE_SPEC
last_validated: 2026-07-12
prd_version: 1.0.0
functional_group: GATE
---

# Use Cases: Missions & Human Gate (GATE)

| ID | Title | Description |
|----|-------|-------------|
| UC-GATE-01 | Define and edit a mission | A mission is a versioned fitness contract the operator authors and edits |
| UC-GATE-02 | Seed a mission's candidate pool | Bootstrap candidates from existing material |
| UC-GATE-03 | Issue verdicts with the stage machine | Verdicts are the only path to stage advancement; WIP=1; validation is probe-gated |
| UC-GATE-04 | Generate the daily brief | A ≤5-minute intel drop with movers, nominations, kills, and loop health |
| UC-GATE-05 | Open a candidate dossier | The full evidence chain, score breakdown, and lineage for one candidate |

---

## UC-GATE-01: Define and edit a mission

A mission is the loop's constitution: a root question plus a fitness contract (components with kinds and weights, domain-tier ladder, scope in/out, source rules and ban-list, discovery cells, cadence rule, WIP limits, degradation ceiling). Mission #1 is `dev-revenue`. Editing the contract is how the operator steers the loop — no code change.

**Acceptance Criteria**
- ☐ Operator can create a mission by declaring its root question and fitness contract
- ☐ Operator can edit a mission's weights, tier ladder, scope, source rules, and discovery cells and have the next cycle honor them
- ☐ System reads the mission contract at the start of every cycle so a mid-run edit takes effect on the following cycle
- ☐ Operator can create a second mission (a different goal) without changing engine code
- ☐ System versions mission-contract changes so a score references the contract version in force when it was computed

## UC-GATE-02: Seed a mission's candidate pool

A new mission does not start empty. The operator imports existing material — captured needs, prior opportunity notes, existing holocron research — as seed candidates the first cycles begin deepening.

**Acceptance Criteria**
- ☐ Operator can import a set of seed items into a mission as initial candidates
- ☐ System creates a candidate (with initial provisional claims where source material exists) for each seed
- ☐ System makes seeded candidates eligible for work-item selection so the first cycles operate on them
- ☐ Operator can see the seeded candidates listed for the mission before any cycle runs

## UC-GATE-03: Issue verdicts with the stage machine

The operator advances candidates only through verdicts: **kill**, **advance**, **redirect** (edit the question), **boost** (raise priority). Kills must cite a ledger claim. `advance → validated` requires a recorded reality-probe result. Only one candidate may be in active build (**WIP = 1**).

**Acceptance Criteria**
- ☐ Operator can issue kill / advance / redirect / boost verdicts against a candidate
- ☐ System requires a cited ledger claim for a kill and rejects an uncited kill
- ☐ System refuses to advance a second candidate into active build while one already occupies it (WIP=1)
- ☐ System refuses `advance → validated` unless a human reality-probe result has been recorded for that candidate
- ☐ System records every verdict as the operator's calibration signal, distinguishing fit verdicts from validity verdicts
- ☐ System retires a candidate on kill while preserving its ledger and lineage, and writes its strongest disconfirming claim as a queryable closeout

## UC-GATE-04: Generate the daily brief

A generated, ≤5-minute brief is the operator's daily touchpoint: score movers (with the claims that moved them), at most three nominations (top candidates plus at least one discovery wildcard), retired-this-cycle with cited reasons, coverage, unclassified domains awaiting tiering, and loop/fleet health.

**Acceptance Criteria**
- ☐ System can generate a daily brief from current ledger state showing score movers and the claims responsible
- ☐ System caps nominations at three and always includes at least one discovery-sourced candidate among them
- ☐ System shows candidates retired since the last brief with the cited reason for each
- ☐ System shows coverage (cells swept), domains awaiting tiering, budget/breaker state, and fleet/degradation state
- ☐ Operator can acknowledge the brief with an explicit touch that resets the degradation ceiling; a file read of the brief does not count as a touch
- ☐ System drops the loop to sense-only when no explicit touch occurs within the mission's degradation ceiling, and reports it

## UC-GATE-05: Open a candidate dossier

For any candidate, the operator can see its full evidence chain — the reasoning behind its score — so a verdict is never a black box.

**Acceptance Criteria**
- ☐ Operator can view a candidate dossier showing every claim with its bound evidence, source, grade, and admission status
- ☐ System shows the score broken down by component with each component's contributing claims and any UNKNOWN components
- ☐ System shows the candidate's lineage (what it derived from and which evidence delta caused each change) and its open disconfirmation questions
- ☐ System regenerates a dossier on material change so it reflects the latest committed cycle
- ☐ Operator can reach a candidate's dossier from its entry in the daily brief
