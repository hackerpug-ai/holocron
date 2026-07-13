---
stability: TEST_SPEC
last_validated: 2026-07-12
prd_version: 1.0.0
---

# E2E / Human Testing Criteria — Fulcrum

Per-UC criteria. Type tags: `[e2e-automated]` `[integration-test]` `[build-gate]` `[human-gate]`. Every AC is covered by ≥1 criterion. Real services throughout: real Convex test/dev deployment, real local inference (fleet-gated lanes), real retrieval, real fetched sources. No mocked DB, no mocked local endpoint on the live lanes.

## LIS: Local Inference Substrate

### UC-LIS-01: Route research calls to local inference
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LIS-001 | A Fulcrum cycle call completes against the configured local endpoint | AC-1 | [integration-test] | `fleet-start`; base URL = `laptop:4545/v1` | Non-empty completion returned; telemetry shows the local endpoint |
| T-LIS-002 | Endpoint + models are configurable without code change | AC-2 | [integration-test] | Change base URL/model env only | Cycle uses the new endpoint; no source edit required |
| T-LIS-003 | No cloud provider is constructed on the cycle path with fallback off | AC-3 | [build-gate] | Static + runtime assertion | Zero cloud-provider instantiation observed on a cycle run |
| T-LIS-004 | Serving endpoint is recorded per call | AC-4 | [e2e-automated] | Run a cycle | Each inference record names its endpoint |

### UC-LIS-02: Map research roles to local models
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LIS-005 | Role→model mapping resolves from config | AC-1,AC-4 | [integration-test] | Set `FULCRUM_ROLE_MAP` | Divergent/convergent resolve to the mapped models |
| T-LIS-006 | Phase resolves the correct role | AC-2 | [e2e-automated] | Run a cycle | ASSAY hits convergent; GENERATE hits divergent (telemetry) |
| T-LIS-007 | ASSAY≠CHALLENGE enforced, fail-closed | AC-3 | [build-gate] | Configure identical models for both | Cycle refuses to run with a distinct-model error |

### UC-LIS-03: Run inference from a tailnet worker
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LIS-008 | Worker runs inference against an endpoint unreachable from Convex | AC-1,AC-2 | [integration-test] | Worker on tailnet; Convex cloud | Cycle completes; worker read/wrote ledger |
| T-LIS-009 | Dispatch is durable; worker restart loses ≤ in-flight cycle | AC-3 | [e2e-automated] | Kill+restart worker mid-run | Queue resumes; no duplicate/lost committed cycle |
| T-LIS-010 | Same worker runs on laptop (dev) and mini (prod) by config | AC-4 | [human-gate] | Deploy to a mini | Worker operates with only config differing |

### UC-LIS-04: Degrade visibly on fleet loss
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LIS-011 | Unreachable endpoint detected + marked within bound | AC-1 | [integration-test] | Stop an endpoint | Fleet state flips degraded/offline within the bound |
| T-LIS-012 | Continues on remaining node when degraded | AC-2 | [integration-test] | One mini down | Cycles continue on the healthy node |
| T-LIS-013 | Drops to reduced mode when fully offline (no cloud) | AC-3,AC-5 | [e2e-automated] | All local endpoints down, fallback off | No generative cycles; zero cloud calls; sense-only |
| T-LIS-014 | Fleet/degradation state shown to operator | AC-4 | [human-gate] | Read the brief | Brief shows current fleet state |

### UC-LIS-05: Record inference telemetry
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LIS-015 | Per-cycle tokens/time/endpoint/role recorded | AC-1 | [e2e-automated] | Run a cycle | `fulcrumCycles.spentJson` populated per phase |
| T-LIS-016 | Aggregate telemetry viewable per mission | AC-2 | [human-gate] | Run several cycles | Tokens/day, cycles/day, per-role split available |
| T-LIS-017 | Telemetry feeds budget enforcement | AC-3 | [integration-test] | Set a low cap | Budget-exceeded detected from recorded numbers |

## CYC: Cycle Loop Engine

### UC-CYC-01: Run one fixed-budget cycle
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-001 | Full cycle runs end-to-end on real inference (**spike gate**) | AC-1 | [integration-test] | Seed `dev-revenue`; fleet up; Convex dev | Committed `fulcrumCycles` row with claims, score, lineage, telemetry |
| T-CYC-002 | Cycle effects are all-or-nothing | AC-2 | [e2e-automated] | Force a mid-cycle error | Zero partial rows across all fulcrum tables |
| T-CYC-003 | Budget cap → explicit `budget_exceeded` row | AC-3 | [e2e-automated] | Set a tiny cap | Cycle-log row `outcome=budget_exceeded`; no silent drop |
| T-CYC-004 | Cycle records item/actions/outcome/telemetry | AC-4 | [e2e-automated] | Run a cycle | All fields present |
| T-CYC-005 | Committed effects observable | AC-5 | [human-gate] | Inspect ledger | Operator sees the committed candidate/claims/score |

### UC-CYC-02: Select next work item by rule
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-006 | Selector returns a target with no operator input | AC-1 | [e2e-automated] | Seeded mission | A valid work item is chosen |
| T-CYC-007 | Priority combines the EVoI terms | AC-2 | [integration-test] | Construct ledger states | Chosen item matches the expected-value ranking |
| T-CYC-008 | Challenge question cannot be starved | AC-3 | [e2e-automated] | Age a challenge past the floor | It is forced into selection |
| T-CYC-009 | Boost verdict raises selection | AC-4 | [integration-test] | Boost a candidate | It is selected sooner |

### UC-CYC-03: Alternate diverge/converge
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-010 | Discovery cycle creates new candidate(s) | AC-1 | [integration-test] | Under-covered cell | ≥1 new candidate with initial claims |
| T-CYC-011 | Deepening cycle adds evidence + re-scores | AC-2 | [integration-test] | Existing candidate | New claim(s) + updated score |
| T-CYC-012 | Cadence honored | AC-3 | [e2e-automated] | Set cadence rule | Mode alternation matches the rule |
| T-CYC-013 | Coverage/mode counts visible | AC-4 | [human-gate] | Read loop health | Diverge/converge counts + coverage shown |

### UC-CYC-04: SENSE — one novel retrieval
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-014 | Planned query is not a near-duplicate of prior queries | AC-1,AC-5 | [integration-test] | Candidate w/ query history | New query differs; prior query recorded |
| T-CYC-015 | Query runs against real sources, fetches content | AC-2 | [integration-test] | Retrieval keys | Real source content returned |
| T-CYC-016 | Costly signals preferred per mission rules | AC-3 | [integration-test] | Mixed results | Costly-signal source chosen when present |
| T-CYC-017 | Source governance respected | AC-4 | [e2e-automated] | Ban-list + delays set | Banned domains skipped; delays honored |

### UC-CYC-05: CHALLENGE — cross-model refutation
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-018 | Challenge runs on a different model than ASSAY | AC-1 | [e2e-automated] | Run a cycle | Telemetry shows distinct models |
| T-CYC-019 | Refuting claims pass the same gate | AC-2 | [integration-test] | Produce a refutation | Refute claim goes through admission identically |
| T-CYC-020 | Strongest disconfirmation queued as future question | AC-3 | [e2e-automated] | Run challenge | A kill-question is attached to the candidate |
| T-CYC-021 | Support claim marked contested only by gate-passing refuter | AC-4 | [integration-test] | Add a gate-passing refuter | Target support claim → contested |
| T-CYC-022 | Challenge never writes a score | AC-5 | [build-gate] | Static + runtime | No score write from the challenge path |

### UC-CYC-06: Run perpetually with budgets and breakers
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-CYC-023 | Unattended cadence runs cycles without per-cycle action | AC-1 | [integration-test] | Enable schedule | Multiple cycles run untouched |
| T-CYC-024 | Budget/breaker halts new cycles + records why | AC-2 | [e2e-automated] | Trip a breaker | New cycles stop; reason logged |
| T-CYC-025 | Clean resume after restart | AC-3 | [e2e-automated] | Restart worker+backend | Queue resumes gap-free |
| T-CYC-026 | Thermal duty-cycle applied | AC-4 | [integration-test] | Sustained load | Duty-cycle limit observed |
| T-CYC-027 | Budget/breaker state visible | AC-5 | [human-gate] | Read loop health | Consumption + breaker state shown |

## LED: Evidence Ledger & Gate

### UC-LED-01: Grade evidence by domain-tier × recency
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-001 | Grade = tier × decay for a classified domain | AC-1 | [e2e-automated] | Known domain, two ages | Grades match expected decayed values |
| T-LED-002 | Tier resolved by deterministic lookup (no model) | AC-2 | [build-gate] | Gate module | No model call in grading path |
| T-LED-003 | Unknown domain → unclassified → provisional | AC-3 | [e2e-automated] | Domain absent from ladder | Claim stays provisional, reason `UNCLASSIFIED_DOMAIN` |
| T-LED-004 | Adding a tier makes evidence gradeable on re-assay | AC-4 | [integration-test] | Publish tier version | Previously-unclassified evidence now grades |
| T-LED-005 | Score stamps the tier version | AC-5 | [e2e-automated] | Score a candidate | `fulcrumScores.domainTierVersion` set |

### UC-LED-02: Admit claims via the predicate
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-006 | Admits a claim meeting floor+window+classified | AC-1 | [e2e-automated] | Valid evidence | Status `admitted` |
| T-LED-007 | Leaves provisional with reason on each failure mode | AC-2 | [e2e-automated] | No/sub-floor/out-of-window/unclassified | Correct machine-readable reason each case |
| T-LED-008 | Admission decision+reason recorded per claim | AC-3 | [e2e-automated] | Run assay | Every claim carries a decision+reason |
| T-LED-009 | Provisional contributes nothing to score | AC-4 | [integration-test] | Provisional-only component | Component score UNKNOWN; total unaffected |

### UC-LED-03: Enforce provenance independence
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-010 | Identical content across domains → one group | AC-1 | [e2e-automated] | Same text on 3 domains | Single provenance group |
| T-LED-011 | Group counts once for independence | AC-2 | [integration-test] | Shared group across claims | Counted once |
| T-LED-012 | One group can't solely support two components | AC-3,AC-5 | [integration-test] | Group supports 2 components | Lower-ranked demoted, reason recorded |
| T-LED-013 | Self-sourced excluded from independence | AC-4 | [e2e-automated] | holocron-sourced evidence | Flagged self-sourced; no independence credit |

### UC-LED-04: Verify verbatim-quote entailment
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-014 | Quote absent from source → rejected | AC-1,AC-4 | [e2e-automated] | Fabricated quote | Claim rejected, distinct reason |
| T-LED-015 | Quote present → admitted | AC-2 | [e2e-automated] | Real quote | Claim admitted |
| T-LED-016 | Verification is deterministic (no model) | AC-3 | [build-gate] | Gate module | Substring check only; no model call |

### UC-LED-05: Compute the deterministic score
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-017 | Support = weighted mean of top-3 grades (saturating) | AC-1 | [e2e-automated] | Grades [1,.9,.8,.7] | supportF = 0.9; 4th adds nothing; 1×[1.0] > 5×[0.5] |
| T-LED-018 | Refute subtracted at ×2 | AC-2 | [e2e-automated] | Add gate-passing refuter | Score drops by exactly w·2·f |
| T-LED-019 | Identical ledger → identical score (determinism) | AC-3 | [e2e-automated] | Re-run compute | Byte-identical score |
| T-LED-020 | Empty component → UNKNOWN, not challenged-zero | AC-4 | [e2e-automated] | No claims in a component | Marked UNKNOWN |
| T-LED-021 | Judgment components scored separately, never via admit() | AC-5 | [integration-test] | Judgment component | Neutral prior until scored; no admission path |
| T-LED-022 | Per-component breakdown visible | AC-6 | [human-gate] | Open dossier | Breakdown with contributing claims shown |

### UC-LED-06: Version weights/tiers and re-score
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-LED-023 | New weight version leaves prior versions intact | AC-1 | [e2e-automated] | Publish v2 | v1 rows unchanged; active=v2 |
| T-LED-024 | Re-score recomputes over admitted claims (no inference) | AC-2 | [integration-test] | Publish v2 | New score rows; zero inference calls |
| T-LED-025 | Retired candidate that now beats its leader resurfaces | AC-3 | [e2e-automated] | Raise a weight | "Reconsider" item in next brief |
| T-LED-026 | Historical scores stamped with versions | AC-4 | [e2e-automated] | Inspect scores | Each stamps weight+tier version |

## GATE: Missions & Human Gate

### UC-GATE-01: Define and edit a mission
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-GATE-001 | Create a mission with a fitness contract | AC-1 | [integration-test] | `dev-revenue` contract | Mission + active contract version created |
| T-GATE-002 | Edits honored on next cycle | AC-2,AC-3 | [e2e-automated] | Edit weights mid-run | Following cycle uses new values |
| T-GATE-003 | Second mission without engine code change | AC-4 | [human-gate] | New mission folder | Loop runs it with no code edit |
| T-GATE-004 | Contract changes versioned; scores reference version | AC-5 | [e2e-automated] | Publish v2 | Score stamps contract version |

### UC-GATE-02: Seed a mission's candidate pool
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-GATE-005 | Import seeds as candidates | AC-1,AC-2 | [integration-test] | Seed set | One candidate per seed, initial claims where sources exist |
| T-GATE-006 | Seeded candidates selectable + listed | AC-3,AC-4 | [e2e-automated] | After seed | First cycles operate on them; list visible pre-cycle |

### UC-GATE-03: Issue verdicts with the stage machine
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-GATE-007 | All four verdicts issuable | AC-1 | [integration-test] | A candidate | kill/advance/redirect/boost each recorded |
| T-GATE-008 | Uncited kill rejected | AC-2 | [e2e-automated] | Kill w/o claim | Rejected; state unchanged |
| T-GATE-009 | WIP=1 enforced | AC-3 | [e2e-automated] | One in active build | Second advance rejected |
| T-GATE-010 | `→validated` needs a recorded probe | AC-4 | [e2e-automated] | No probe row | Advance-to-validated rejected |
| T-GATE-011 | Verdicts recorded; fit vs validity distinguished | AC-5 | [e2e-automated] | Issue verdicts | Kind recorded |
| T-GATE-012 | Kill retires + writes closeout, preserves ledger | AC-6 | [e2e-automated] | Kill a candidate | Stage retired; lineage kept; closeout claim written |

### UC-GATE-04: Generate the daily brief
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-GATE-013 | Brief shows movers + responsible claims | AC-1 | [integration-test] | After cycles | Movers with claim references |
| T-GATE-014 | ≤3 nominations incl. ≥1 discovery wildcard | AC-2 | [e2e-automated] | Many candidates | At most 3; ≥1 discovery-sourced |
| T-GATE-015 | Retired-this-cycle with cited reasons | AC-3 | [e2e-automated] | A retirement | Shown with reason |
| T-GATE-016 | Coverage/domains/budget/fleet shown | AC-4 | [human-gate] | Read brief | All present |
| T-GATE-017 | Explicit ack resets ceiling; file read does not | AC-5 | [e2e-automated] | Ack vs raw read | Only `ackBrief` writes a touch |
| T-GATE-018 | No touch within ceiling → sense-only, reported | AC-6 | [e2e-automated] | Advance clock past ceiling | Loop drops to sense-only; brief flags it |

### UC-GATE-05: Open a candidate dossier
| # | Criterion | AC Ref | Type | Setup | Pass/Fail |
|---|-----------|--------|------|-------|-----------|
| T-GATE-019 | Dossier shows full claim→evidence→source→grade→status | AC-1 | [integration-test] | A scored candidate | Full claim table rendered |
| T-GATE-020 | Score breakdown with contributing claims + UNKNOWNs | AC-2 | [e2e-automated] | A candidate | Per-component breakdown incl. UNKNOWN |
| T-GATE-021 | Lineage + open kill-questions shown | AC-3 | [e2e-automated] | A mutated candidate | Lineage + open questions present |
| T-GATE-022 | Dossier regenerates on material change | AC-4 | [e2e-automated] | New cycle | Reflects latest cycle |
| T-GATE-023 | Reachable from the brief | AC-5 | [human-gate] | From brief | Navigates to the dossier |

## Summary

| Type | Count |
|------|-------|
| [e2e-automated] | 43 |
| [integration-test] | 22 |
| [build-gate] | 5 |
| [human-gate] | 10 |
| **Total** | **80** |

**AC coverage**: every AC across the 22 UCs is referenced by ≥1 criterion. The **spike gate** (T-CYC-001) is the single most important criterion — one real full cycle on real local inference proving the initiative's two gating risks before perpetual operation is built.
