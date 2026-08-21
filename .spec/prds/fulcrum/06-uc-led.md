---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: LED
---

# Use Cases: Evidence Ledger & Gate (LED)

The deterministic core. Every UC here is **code, not a model call** — the same ledger produces the same result every time. This is what replaces holocron's LLM-confidence termination with a metric the model cannot narrate past.

**Invariant:** no `generateText` and no fleet role inside gate or score modules. `judge` never appears. ASSAY (the agent) extracts claims only; **admit + score are this group's code**, not a Mastra agent tool.

Persistence is the live evidence graph plus named extensions ([03-data-schema.md](./09-technical-requirements/03-data-schema.md)). Prospector table names (`prospects`, `cycles`, `scores`, `fulcrumCycles`) are not used.

| ID | Title | Description |
|----|-------|-------------|
| UC-LED-01 | Grade evidence by domain-tier × recency | Deterministic source grading from a versioned domain ladder |
| UC-LED-02 | Admit claims via the predicate | A claim is admitted only when its evidence clears floor, window, and source class |
| UC-LED-03 | Enforce provenance independence | Syndication collapses to one source; self-sourced never corroborates |
| UC-LED-04 | Verify verbatim-quote entailment | An admitted claim's quote must be an exact substring of the fetch artifact's `normalizedText` |
| UC-LED-05 | Compute the deterministic score | Saturating, disconfirmation-weighted, sparsity-aware aggregation into `belief_scores` |
| UC-LED-06 | Version weights/tiers and re-score | Weight/tier changes are versioned; retired candidates re-scored |

---

## UC-LED-01: Grade evidence by domain-tier × recency

Evidence grade is a deterministic function: `tier_value(registrable_domain) × recency_decay(age)`. Tier comes from a versioned domain ladder in the mission contract (gov data > peer-reviewed > industry report > company-primary > reputable press > forum > blog > SEO), stored as `domain_tier_versions` + `domain_tiers`. An unknown domain is *unclassified* — never assigned a tier by a model.

**Acceptance Criteria**
- ☐ System can compute an evidence grade as tier value times recency decay for a classified domain
- ☐ System resolves a domain's tier by deterministic lookup against the mission's active `domain_tier_versions` row (never by an LLM judgment, never by `judge`)
- ☐ System marks evidence from a domain absent from the ladder as unclassified, leaving its claim provisional
- ☐ Operator can add a domain to the ladder (publishing a new tier version) and see previously-unclassified evidence become gradeable on re-assay
- ☐ System stamps each `belief_scores` row with `domain_tier_version`, so a historical score stays interpretable

---

## UC-LED-02: Admit claims via the predicate

A claim is admitted only if it has at least one bound evidence object at or above the component's grade floor, within the component's recency window, on a classified source, with a verified quote. Claims failing the predicate persist as **provisional** (`claims.status`) and never affect a `belief_scores` row.

**Acceptance Criteria**
- ☐ System admits a claim that has ≥1 bound evidence at/above the grade floor, within window, on a classified domain, with `quote_text` ⊆ `sources.normalized_text`
- ☐ System leaves a claim provisional (with a machine-readable reason) when it has no evidence, sub-floor evidence, out-of-window evidence, only unclassified-domain evidence, or an unverifiable quote
- ☐ System records the admission decision and reason for every claim (`claims.status`, `claims.passes_gate`, `claims.qualifying_grade`)
- ☐ System guarantees a provisional claim contributes nothing to any `belief_scores` row

---

## UC-LED-03: Enforce provenance independence

Independence is provenance-based, not domain-count-based. Byte-identical (MVP) content across many domains collapses to one **provenance group** counted once; a single group cannot solely support two components of the same candidate; **self-sourced** evidence (retrieved from holocron's own prior output, including `publishDocumentForRun` rows) never satisfies independence.

**Acceptance Criteria**
- ☐ System assigns identical source content a single `provenance_group` regardless of how many domains carry it
- ☐ System counts a provenance group at most once when testing whether a component is independently supported
- ☐ System prevents one provenance group from being the sole support for more than one component of the same candidate
- ☐ System flags evidence retrieved from holocron's own prior output as `self_sourced` and excludes it from satisfying independence
- ☐ System demotes the lower-ranked component's claim (with a source-independence reason) when two components would otherwise share a sole group

---

## UC-LED-04: Verify verbatim-quote entailment

An anti-fabrication guard: an admitted claim must carry a `quote_text` that is an exact substring of the bound source's `normalized_text` (the fetch artifact). A quote that isn't found is rejected — the model cannot manufacture support. Quotes sliced from hybrid-search `sourceText` (e.g. `sourceText.slice(0, 280)`) **fail**.

**Acceptance Criteria**
- ☐ System rejects a claim whose supporting quote is not found as a substring of `sources.normalized_text`
- ☐ System admits a claim whose quote is verified present in that artifact
- ☐ System performs the quote check deterministically in code (no model involvement, no `generateText`, no fleet role)
- ☐ System records a rejected-for-unverifiable-quote outcome distinctly from other admission failures
- ☐ System fails a quote that equals a truncated RRF `sourceText` buffer rather than the artifact's `normalizedText`

---

## UC-LED-05: Compute the deterministic score

Per component, `f = mean of the top-3 admitted-claim grades` (saturating — a fourth marginal source adds nothing, one gold source beats five weak ones). Total = Σ weightᵢ·(f_supportᵢ − m·f_refuteᵢ) with the disconfirmation multiplier `m` (default 2.0). A component with zero admitted claims scores **UNKNOWN**, never zero-as-if-challenged. Result persists as an append-only `belief_scores` row.

**Acceptance Criteria**
- ☐ System computes each evidence component's support contribution as the weighted mean of its top-3 admitted support-claim grades
- ☐ System subtracts refuting evidence at the disconfirmation multiplier (default 2×) from a component's contribution
- ☐ System yields an identical total score for identical ledger state (pure recompute — no nondeterminism)
- ☐ System marks a component with no admitted claims as UNKNOWN and never treats absent evidence as a passed challenge
- ☐ System scores judgment-kind components (operator rubric, e.g. buildability/fit) separately from evidence components, defaulting to a neutral prior until the operator scores them, and never routes them through claim admission
- ☐ Operator can see, per candidate, the score broken down by component with the claims that produced each contribution (dossier Markdown)
- ☐ Each `belief_scores` row stamps `weight_version` and `domain_tier_version`

---

## UC-LED-06: Version weights/tiers and re-score

Scoring weights, the disconfirmation multiplier, and the domain-tier ladder are versioned (`weight_versions`, `domain_tier_versions`) and never mutated in place. When the operator publishes a new weight version, the system re-scores affected `candidates` — including retired ones — so an early miscalibration cannot bury a good candidate forever. Re-score is LED code; it does not call a model.

**Acceptance Criteria**
- ☐ Operator can publish a new scoring-weight version without altering prior versions
- ☐ System re-scores a mission's candidates against the new weight version by recomputing over already-admitted claims (no new inference)
- ☐ System surfaces any retired candidate that would now beat its niche's leader as a "reconsider" item in the next brief
- ☐ System keeps every historical `belief_scores` row interpretable by stamping it with the weight and tier versions used
