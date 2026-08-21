---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: CYC
---

# Use Cases: Cycle Loop Engine (CYC)

> **v3.0.0 fleet alignment.** Cycle phases address **fleet roles** (`fulcrum-assay`, `fulcrum-challenge`), never models or hosts — see [ADR-007 / ADR-008](./09-technical-requirements/00-architecture-decisions.md) and the LIS group. Cross-model challenge is preserved: the two roles are guaranteed to resolve to different models.

| ID | Title | Description |
|----|-------|-------------|
| UC-CYC-01 | Run one fixed-budget cycle | Execute SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT within a hard budget |
| UC-CYC-02 | Select the next work item by rule | The loop, not the operator, chooses what to research next |
| UC-CYC-03 | Alternate diverge/converge | Cycles alternate discovery of new candidates with deepening of leaders |
| UC-CYC-04 | SENSE — one novel retrieval | Plan and run exactly one non-repeating retrieval per cycle |
| UC-CYC-05 | CHALLENGE — cross-model refutation | A different model attempts to refute; its best attack becomes future work |
| UC-CYC-06 | Run perpetually with budgets and breakers | Schedule unattended operation with caps and circuit breakers |

---

## UC-CYC-01: Run one fixed-budget cycle

One cycle processes one work item (a candidate or a discovery cell) through six phases and either COMMITs a durable transaction or records an explicit non-commit outcome. Inference runs local (LIS); scoring runs in the gate (LED).

**Acceptance Criteria**
- ☐ System can run a full SENSE→GENERATE→ASSAY→CHALLENGE→MAP→COMMIT cycle end-to-end on a real work item using local inference
- ☐ System writes all cycle effects (evidence, claims, score, lineage, cycle-log row) in one durable transaction, or none of them
- ☐ System enforces a per-cycle budget (wall-clock and token caps) and records a `budget_exceeded` outcome as an explicit cycle-log row when a cap is hit — never a silent non-commit
- ☐ System records, for every cycle, its work item, phase actions, outcome, and inference telemetry
- ☐ Operator can observe a completed cycle's committed effects in the ledger

## UC-CYC-02: Select the next work item by rule

The loop chooses its own next target from durable state — the leader with the thinnest evidence, a candidate with an unrun challenge question, or the least-covered discovery cell — so the operator's biases never steer *what gets researched*.

**Acceptance Criteria**
- ☐ System can compute a next-work-item selection from current ledger state without operator input
- ☐ System prioritizes by an expected-value rule combining evidence thinness, unrun disconfirmation questions, staleness, discovery-cell gaps, and operator boost signals
- ☐ System guarantees a queued challenge question cannot be starved indefinitely (a bounded-age challenge is forced into selection)
- ☐ Operator can raise a candidate's selection priority via a `boost` verdict and observe it selected sooner

## UC-CYC-03: Alternate diverge/converge

The loop alternates **discovery** cycles (surface new candidates in under-covered territory) with **deepening** cycles (add evidence to leaders, retire the weakest), governed by the mission's cadence rule.

**Acceptance Criteria**
- ☐ System can run a discovery cycle that creates one or more new candidates from an under-covered discovery cell
- ☐ System can run a deepening cycle that adds evidence to an existing candidate and re-scores it
- ☐ System alternates the two modes according to the mission's declared cadence rule (e.g., diverge until N new niches filled, then converge until evidence saturates)
- ☐ Operator can see, in loop health, how many cycles of each mode ran and current coverage

## UC-CYC-04: SENSE — one novel retrieval

Each cycle plans exactly one retrieval question the candidate's dossier cannot already answer, runs it against real sources (reusing holocron's Exa/Jina tools), and extracts candidate evidence — preferring costly signals over cheap talk.

**Acceptance Criteria**
- ☐ System can plan one retrieval query (via the divergent model) that is not a near-duplicate of this item's prior queries
- ☐ System executes the query against real retrieval sources and fetches candidate source content
- ☐ System prefers costly-signal sources per the mission's source rules (job postings, regulatory/pricing/spend evidence) over forum chatter when both are available
- ☐ System respects the mission's source governance (ban-list, per-domain courtesy delays) during retrieval
- ☐ System records the executed query so future cycles will not repeat it

## UC-CYC-05: CHALLENGE — cross-model refutation

After ASSAY, a *different* model attempts to refute the candidate's admitted claims and runs a key-assumptions check. Its strongest attack becomes a queued retrieval question for a future cycle; any refuting claims pass the same gate as supporting ones.

**Acceptance Criteria**
- ☐ System runs the challenge pass on the `fulcrum-challenge` role, which resolves to a different served model than the `fulcrum-assay` role used for extraction in the same cycle, verified against the model each call actually resolved to
- ☐ System produces refuting claims that are submitted through the identical admission gate as supporting claims (no privileged path)
- ☐ System emits the strongest disconfirmation as a queued retrieval question attached to the candidate
- ☐ System marks a supporting claim contested only when a gate-passing refuting claim targets it
- ☐ System never lets the challenge pass write a score (it produces claims and questions only)

## UC-CYC-06: Run perpetually with budgets and breakers

The loop runs unattended on a schedule, bounded by daily budgets and circuit breakers (token, thermal duty-cycle, consecutive-failure), and survives restarts.

**Acceptance Criteria**
- ☐ System can run cycles unattended on a recurring schedule without per-cycle operator action
- ☐ System stops launching new cycles when a daily budget cap or a tripped breaker is reached, and records why
- ☐ System resumes cleanly after a worker or backend restart, losing at most the in-flight cycle
- ☐ System applies a thermal/duty-cycle limit so sustained operation does not peg the local hardware
- ☐ Operator can see current budget consumption and breaker state in loop health
