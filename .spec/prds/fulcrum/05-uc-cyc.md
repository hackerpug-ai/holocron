---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: CYC
---

# Use Cases: Cycle Loop Engine (CYC)

> **v3.0.0.** Cycle phases address live fleet roles (`divergent` / `convergent` / `embed`), never models, hosts, or `judge`. The live template is `evidence-research` (`plan → retrieve → extract → assay → challenge → gate → commit`); `fulcrum` is an alias. GENERATE and MAP are **new stages Fulcrum adds**. Cross-model challenge is preserved: `divergent` ≠ `convergent` on resolved identity.

| ID | Title | Description |
|----|-------|-------------|
| UC-CYC-01 | Run one fixed-budget cycle | Execute the mapped stage graph within a hard budget |
| UC-CYC-02 | Select the next work item by rule | The loop, not the operator, chooses what to research next |
| UC-CYC-03 | Alternate diverge/converge | Cycles alternate discovery of new candidates with deepening of leaders |
| UC-CYC-04 | SENSE — one novel retrieval | Plan (`plan`) and retrieve (`retrieve`) exactly one non-repeating corpus retrieval per cycle |
| UC-CYC-05 | CHALLENGE — cross-model refutation | `convergent` attempts to refute; its best attack becomes future work |
| UC-CYC-06 | Run perpetually with budgets and breakers | `fulcrum:cycle` job dispatches `mission:execute` on a cadence with caps and leases |

### Stage map (product name → live id)

| Fulcrum name | Live stage | Action |
|--------------|------------|--------|
| SENSE | `plan` + `retrieve` | Keep. Retrieval = named Mastra registry tools, corpus-only. |
| GENERATE | *(new)* | New stage; typed I/O; `convergent`. |
| ASSAY | `extract` + `assay` | Extract only (`divergent`). Admit + score stay in LED. |
| CHALLENGE | `challenge` | Keep (`convergent`). |
| MAP | *(new)* | New stage; typed I/O (niche / retire). |
| COMMIT | `gate` + `commit` | Gate is LED; commit is the Postgres TX on `mission_runs`. |

**GENERATE typed I/O.** Input schema: `{ candidateId, retrieveOutput, missionContract }` (schemaRef `mission.fulcrum.generate.input`). Output schema: `{ proposedTitle, proposedQuestion, mutationKind, rationale }` (schemaRef `mission.fulcrum.generate.output`).

**MAP typed I/O.** Input schema: `{ candidateId, beliefScoreId, existingNicheKeys }` (schemaRef `mission.fulcrum.map.input`). Output schema: `{ nicheKey, action: 'place' \| 'retire' \| 'hold' }` (schemaRef `mission.fulcrum.map.output`).

---

## UC-CYC-01: Run one fixed-budget cycle

One cycle processes one work item (a candidate or a discovery cell) through the mapped stage graph and either COMMITs a durable Postgres transaction or records an explicit non-commit outcome. Inference runs local (LIS); scoring runs in the gate (LED). ASSAY extracts; it does not admit or score.

**Acceptance Criteria**
- ☐ System can run a full mapped cycle end-to-end on a real work item using local inference (`plan`/`retrieve`/`GENERATE`/`extract`/`assay`/`challenge`/`MAP`/`gate`/`commit`)
- ☐ System writes all cycle effects (`sources`, `claims`, `belief_scores`, lineage `relations`, `mission_runs` row) in one durable transaction, or none of them
- ☐ System enforces a per-cycle budget (wall-clock and token caps) and records `mission_runs.status='budget_exceeded'` when a cap is hit — never a silent non-commit
- ☐ System records, for every cycle, its work item, phase actions, outcome, and header-truthful inference telemetry on `mission_stage_runs`
- ☐ Operator can observe a completed cycle's committed effects in the ledger (Markdown dossier / `holo fulcrum dossier`)

---

## UC-CYC-02: Select the next work item by rule

The loop chooses its own next target from durable state — the leader with the thinnest evidence, a candidate with an unrun challenge question, or the least-covered discovery cell — so the operator's biases never steer *what gets researched*. The selector is a pure Postgres query over the evidence graph, not `convex/fulcrum/selector.ts`.

**Acceptance Criteria**
- ☐ System can compute a next-work-item selection from current ledger state without operator input
- ☐ System prioritizes by an expected-value rule combining evidence thinness, unrun disconfirmation questions, staleness, discovery-cell gaps, and operator boost signals
- ☐ System guarantees a queued challenge question cannot be starved indefinitely (a bounded-age challenge is forced into selection)
- ☐ Operator can raise a candidate's selection priority via a `boost` verdict (`holo fulcrum verdict … boost`) and observe it selected sooner

---

## UC-CYC-03: Alternate diverge/converge

The loop alternates **discovery** cycles (surface new candidates in under-covered territory) with **deepening** cycles (add evidence to leaders, retire the weakest), governed by the mission's cadence rule.

**Acceptance Criteria**
- ☐ System can run a discovery cycle that creates one or more new `candidates` from an under-covered discovery cell
- ☐ System can run a deepening cycle that adds evidence to an existing candidate and re-scores it into a new `belief_scores` row
- ☐ System alternates the two modes according to the mission's declared cadence rule (e.g., diverge until N new niches filled, then converge until evidence saturates)
- ☐ Operator can see, in the daily brief **Loop health** section, how many cycles of each mode ran and current coverage

---

## UC-CYC-04: SENSE — one novel retrieval

Each cycle plans exactly one retrieval question the candidate's dossier cannot already answer (`plan`, `convergent`), runs it against the **holocron corpus** via named Mastra registry tools, and writes a **fetch artifact**. It does **not** reuse Exa/Jina via `convex/research/tools.ts`. There is no such registry tool.

**Registry tools SENSE may call** (must appear in the Fulcrum template's `toolGrants`; today the alias ships `toolGrants: []` and Fulcrum fills them):

- `hybrid_search`
- `search_fts`
- `search_vector`
- `search_research`
- `get_research_session`
- `get_document`

**Fetch artifact** (written onto `sources`; quotes later must be a substring of **this** `normalizedText`, not an RRF snippet):

```ts
{ url: string, fetchedAt: string, raw: string, normalizedText: string, contentHash: string }
```

Ban-list and per-domain courtesy delays are **Zod fields on the mission contract** and are **enforced in the retrieval client** (drop corpus hits whose `source_domain` is banned; delay before any outbound host — today there is no outbound host).

**Acceptance Criteria**
- ☐ System can plan one retrieval query (via `convergent` on `plan`) that is not a near-duplicate of this item's prior queries
- ☐ System executes the query via one or more of the named registry tools and persists a fetch artifact on `sources` with `{ url, fetchedAt, raw, normalizedText, contentHash }`
- ☐ System prefers costly-signal sources per the mission's source rules (job postings, regulatory/pricing/spend evidence) over forum chatter when both are present **in the corpus**
- ☐ System respects the mission's source governance (ban-list, per-domain courtesy delays) during retrieval — Zod-validated and client-enforced
- ☐ System records the executed query so future cycles will not repeat it
- ☐ System **fails closed** if a later quote is sliced from hybrid-search `sourceText` (e.g. `sourceText.slice(0, 280)`) rather than from the artifact's `normalizedText`

---

## UC-CYC-05: CHALLENGE — cross-model refutation

After ASSAY extracts claims and LED admits them, `convergent` attempts to refute the candidate's admitted claims and runs a key-assumptions check. Its strongest attack becomes a queued retrieval question for a future cycle; any refuting claims pass the same gate as supporting ones. CHALLENGE never scores.

**Acceptance Criteria**
- ☐ System runs the challenge pass on `convergent` (alias `fulcrum-challenge` optional), which resolves to a different served model than the `divergent` role used for extraction in the same cycle, verified against the model each call actually resolved to
- ☐ System produces refuting claims that are submitted through the identical admission gate as supporting claims (no privileged path)
- ☐ System emits the strongest disconfirmation as a queued retrieval question attached to the candidate
- ☐ System marks a supporting claim contested only when a gate-passing refuting claim targets it
- ☐ System never lets the challenge pass write a `belief_scores` row (it produces claims and questions only)
- ☐ System records, as a quality signal, whether a queued kill-question later yields an **admitted** disconfirming claim (LIS-03 second CHALLENGE signal)

---

## UC-CYC-06: Run perpetually with budgets and breakers

The loop runs unattended as a **`MIGRATED_JOBS` row named `fulcrum:cycle`**. Cadence comes from the mission contract (default `interval 15m`). The job's handler dispatches **`mission:execute`** for template `evidence-research` tagged `fulcrum`. Lease owner is the **scheduler-worker** (`mission_runs.lease_owner` / `lease_token` / `lease_expires_at`). The job checks the daily budget (mission `budgets` + daily cycle ceiling) before launching a cycle.

**Acceptance Criteria**
- ☐ System can run cycles unattended on the `fulcrum:cycle` cadence without per-cycle operator action
- ☐ System stops launching new cycles when a daily budget cap or a tripped breaker is reached, and records why on `mission_runs`
- ☐ System resumes cleanly after a **Mastra service + scheduler-worker** restart, losing at most the in-flight lease, resumed from Postgres `lease_owner` / `lease_expires_at`
- ☐ System applies a thermal/duty-cycle limit so sustained operation does not peg the local hardware
- ☐ Operator can see current budget consumption and breaker state in the daily brief **Loop health** section
