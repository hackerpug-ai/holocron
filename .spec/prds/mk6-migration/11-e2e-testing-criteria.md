---
stability: TEST_SPEC
last_validated: 2026-07-13
prd_version: 1.0.0
---

# E2E / Human Testing Criteria — MK-VI Platform Migration

Per-UC criteria. **Type tags:** `[integration-test]` (real service), `[e2e-automated]` (RN app driven), `[human-gate]` (operator-verified), `[api-contract]`, `[build-gate]`. The real-service mandate (real Postgres + Mastra + fleet) governs every integration criterion. AC refs point to the acceptance criteria in the matching UC file.

## PLAT — Platform Foundation

### UC-PLAT-01: Provision Postgres on the mini
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-PLAT-001 | Postgres+pgvector reachable over Tailscale | AC-1 | integration-test | PG running on mini | `SELECT 1` + `vector` extension present from laptop over tailnet |
| T-PLAT-002 | All Drizzle migrations apply clean | AC-2 | integration-test | fresh PG | migrate → all tables + HNSW/GIN indexes exist, 0 errors |
| T-PLAT-003 | Logical replication ready for Zero | AC-3 | integration-test | PG configured | `wal_level=logical`, `zero_pub` covers reactive subset only, PK replica identity confirmed |
| T-PLAT-004 | Ledger tables reject UPDATE/DELETE | AC-4 | integration-test | evidence tables migrated | attempted UPDATE/DELETE raises; INSERT succeeds |

### UC-PLAT-02: Stand up the Mastra service
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-PLAT-005 | Service boots + health over Tailscale | AC-1 | integration-test | Mastra on mini | `GET /health` 200 from laptop |
| T-PLAT-006 | Single shared Zod registry, no dup layer | AC-2 | integration-test | service up | a tool schema resolves identically for agent, workflow, MCP; no `config/validation.ts` dup present |
| T-PLAT-007 | Hono API reachable, tailnet-only auth | AC-3 | integration-test | service up | tailnet request succeeds; no RLS/app-auth on path |
| T-PLAT-008 | Role router resolves to live fleet | AC-4 | integration-test | fleet up | `resolveModel('divergent')` returns a working model, completes a call |

### UC-PLAT-03: Scheduler & durable queue
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-PLAT-009 | All 16 jobs run + side-effect | AC-1 | integration-test | scheduler + PG | each job fires and its DB side-effect is observed |
| T-PLAT-010 | Exactly-once lease survives kill-9 | AC-2 | integration-test | queue + PG | kill-9 mid-job → resume, no duplicate side-effect |
| T-PLAT-011 | Interactive prioritized over background | AC-3 | integration-test | queue loaded | interactive job dequeues ahead of background |

### UC-PLAT-04: Observability, budget ledger & evals
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-PLAT-012 | OTel trace per run in Langfuse | AC-1 | integration-test | Langfuse self-host | a mission run produces a viewable trace |
| T-PLAT-013 | Inference telemetry to Postgres | AC-2 | integration-test | service + PG | tokens/wall-ms/endpoint/role rows written per call |
| T-PLAT-014 | Local-judge scores an output | AC-3 | integration-test | judge role up | rubric score persisted for a sample output |

### UC-PLAT-05: Deployment & dev/prod parity
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-PLAT-015 | One-command up/down on mini | AC-1 | human-gate | mini | full stack starts/stops with one command each |
| T-PLAT-016 | Identical dev stack on laptop | AC-2 | human-gate | laptop | same config contract boots the stack |
| T-PLAT-017 | Config from one source, no Convex env | AC-3 | build-gate | repo | grep finds zero Convex env aliases; config resolves |

## DATA — Data Layer & ETL Migration

### UC-DATA-01: Postgres domain schema
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-DATA-001 | Full schema materializes | AC-1 | integration-test | fresh PG | all groups + merges migrate, 0 errors |
| T-DATA-002 | jsonb round-trips typed | AC-2 | integration-test | PG | write/read a polymorphic payload, structural equality |
| T-DATA-003 | Status CHECK rejects out-of-vocab | AC-3 | integration-test | PG | invalid status INSERT fails; normalized value passes |
| T-DATA-004 | Merges collapsed | AC-4 | integration-test | schema | one `analysis_*` trio + one `research_*` trio; no per-domain shells |

### UC-DATA-02: Evidence-graph substrate
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-DATA-005 | Contradiction → current belief as-of | AC-1 | integration-test | evidence tables | insert claim + 2 contradicting passages; as-of query returns correct current belief |
| T-DATA-006 | Belief revision append-only | AC-2 | integration-test | PG | revise → new row + prior `tx_to` stamped; no in-place update |
| T-DATA-007 | Internal doc as self-sourced source | AC-3 | integration-test | docs + sources | doc registers as source; its chunks are the passages searched |
| T-DATA-008 | supports/contradicts edges computable | AC-4 | integration-test | relations | net support computed from validity-windowed edges |

### UC-DATA-03: Local re-embedding & chunking
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-DATA-009 | Every doc chunked + 1024-dim vector | AC-1 | integration-test | fleet embed route | 0 passages null/wrong-dim; every non-empty doc ≥1 passage |
| T-DATA-010 | Past-8K retrieval works | AC-2 | integration-test | PG + pgvector | golden doc with relevant span >8K ranks top-k |
| T-DATA-011 | embed() query/doc asymmetry | AC-3 | integration-test | fleet | helper produces both modes; prefix applied to query only |
| T-DATA-012 | Re-embed idempotent/resumable | AC-4 | integration-test | PG | re-run adds no duplicate passages; resumes after interrupt |

### UC-DATA-04: Hybrid search on Postgres
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-DATA-013 | RRF hybrid in one round-trip | AC-1 | integration-test | PG + pgvector | vector+FTS fused, ranked results returned |
| T-DATA-014 | Recall ≥ old hybridSearch | AC-2 | integration-test | golden set | new recall ≥ Convex baseline |
| T-DATA-015 | Inline-column semantic search, no cloud | AC-3 | integration-test | PG | 5 short-text surfaces search via inline HNSW, no Cohere |

### UC-DATA-05: Big-bang ETL & file storage
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-DATA-016 | Row-count parity all tables | AC-1 | integration-test | real export + PG | every target count == source (merges summed) |
| T-DATA-017 | FK integrity, zero orphans | AC-2 | integration-test | loaded PG | constraints apply clean + NULL-FK audit = 0 |
| T-DATA-018 | Blob served with Range/206 | AC-3 | integration-test | blob store + Hono | MP3 fetch returns 206 + correct length |
| T-DATA-019 | ETL idempotent from archive | AC-4 | integration-test | archive | re-run → no dup rows/blobs |

## SVC — Backend Services & Mission Engine

### UC-SVC-01: Mission Engine
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SVC-001 | Mission runs from contract row | AC-1 | integration-test | Mastra + PG | typed output produced from a template row |
| T-SVC-002 | Resume after SIGKILL | AC-2 | integration-test | Mastra + PG | kill-9 mid-run → resume from last committed step |
| T-SVC-003 | Commit all-or-nothing + idempotent replay | AC-3 | integration-test | PG | kill-9 mid-commit → no partial rows; replay returns stored result |
| T-SVC-004 | Budget breach → explicit outcome | AC-4 | integration-test | Mastra | exceeding a budget records `budget_exceeded`, not silent stop |

### UC-SVC-02: Pipelines as templates
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SVC-005 | Pipelines run as templates | AC-1 | integration-test | Mastra + PG + fleet | research/whatsNew/assimilate/shop/subscriptions produce former output |
| T-SVC-006 | 4 business pipelines → 1 template, server-side | AC-2 | integration-test | Mastra + fleet | one report template covers all four; reasoning on fleet |
| T-SVC-007 | No per-domain shells remain | AC-3 | build-gate | repo | shared templates + registry; no copy-pasted modules |
| T-SVC-008 | Standing mission invokes sub-workflow | AC-4 | integration-test | Mastra + PG | subscription mission calls research template, publishes doc |

### UC-SVC-03: Chat redesign
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SVC-009 | Streamed token response over SSE | AC-1 | integration-test | Mastra + fleet | message → SSE token stream from a specialist on the fleet |
| T-SVC-010 | Native tool loop, no manual chaining | AC-2 | integration-test | Mastra | agentic loop bounded by maxSteps/budget; no `runAfter`/23-switch |
| T-SVC-011 | Reconnect continues from Postgres | AC-3 | e2e-automated | app + Zero | disconnect mid-response → durable message continues on reconnect |
| T-SVC-012 | Triage/specialist role routing | AC-4 | integration-test | fleet | router on divergent; specialists on bound roles, least-priv tools |

### UC-SVC-04: MCP rehost & public endpoint
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SVC-013 | All 44 tools, Postgres-backed, parity | AC-1 | api-contract | MCP + PG | each tool returns Convex-shape result; 0 Convex calls |
| T-SVC-014 | Stateless MCP, no `module:fn` refs | AC-2 | build-gate | repo | grep: 0 `"module:fn" as any` in holocron-mcp/src |
| T-SVC-015 | `/article/` byte-comparable | AC-3 | integration-test | Hono + PG | sample share token renders identical HTML |
| T-SVC-016 | Duplicate Zod layer gone | AC-4 | build-gate | repo | 373-line `config/validation.ts` dup removed |

### UC-SVC-05: Human gate, steering & fulcrum seams
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SVC-017 | Deterministic gate enforcement | AC-1 | integration-test | ledger | uncited kill rejected; 2nd WIP refused; unprobed advance refused |
| T-SVC-018 | Mid-run steering takes effect next cycle | AC-2 | integration-test | Mastra + PG | steering row alters following cycle, no restart |
| T-SVC-019 | ASSAY≠CHALLENGE, same gate | AC-3 | integration-test | fleet | distinct instances; refuting claims pass identical admission |
| T-SVC-020 | Fulcrum seams sufficient | AC-4 | human-gate | platform | fulcrum authorable as a template with no new platform code |

## INFER — Local Inference & Research Engine

### UC-INFER-01: Role router & local-first
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-INFER-001 | Zero cloud on default path | AC-1 | integration-test | fleet + net assert | all calls hit fleet; no Anthropic unless escape declared |
| T-INFER-002 | No provider named at call sites | AC-2 | build-gate | repo | all sites name a role; `claudeFlash/Pro/Ultra` gone |
| T-INFER-003 | divergent/convergent resolve correctly | AC-3 | integration-test | fleet | roles map to 35B-A3B / 27B; steps route to bound role |

### UC-INFER-02: Deterministic research engine
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-INFER-004 | Terminate on evidence gate, not confidence | AC-1 | integration-test | research mission | high-confidence-thin-evidence case does NOT terminate |
| T-INFER-005 | Admission is pure-TS, no model | AC-2 | integration-test | gate | admission path has no model call; deterministic result |
| T-INFER-006 | Zero pi/harness dependency | AC-3 | integration-test | process/net | only fleet + tool calls observed; no pi |
| T-INFER-007 | ASSAY≠CHALLENGE instances | AC-4 | integration-test | fleet | distinct instances in one cycle |

### UC-INFER-03: Structured output on local models
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-INFER-008 | Schema-valid or explicit fail | AC-1 | integration-test | fleet | malformed → bounded repair → valid, or explicit error past cap |
| T-INFER-009 | Boot-time capability probe | AC-2 | integration-test | fleet | probe selects constrained vs repair per role |
| T-INFER-010 | Every extraction Zod-validated | AC-3 | build-gate | repo | extraction sites validate w/ capped retry |

### UC-INFER-04: Claude escape hatch & budget ledger
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-INFER-011 | Escape only when declared + budget OK | AC-1 | integration-test | ledger | over-ceiling escape blocked; declared+within passes |
| T-INFER-012 | Every escape metered | AC-2 | integration-test | PG + Anthropic | one real budgeted call logs reason/tokens/cost |
| T-INFER-013 | No Anthropic on default path | AC-3 | integration-test | net assert | normal run makes zero Anthropic requests |

### UC-INFER-05: Degraded modes
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-INFER-014 | Degrade, never silent cloud | AC-1 | integration-test | fleet down | research→sense-only, chat→surfaced; no cloud fallback |
| T-INFER-015 | Clear unavailable state in chat | AC-2 | e2e-automated | app | user sees "local fleet unavailable", not a hang |
| T-INFER-016 | Auto-resume on endpoint return | AC-3 | integration-test | fleet toggle | run resumes when endpoint returns |

## SYNC — Client Sync, Cutover & Decommission

### UC-SYNC-01: Zero integration & app rewrite
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SYNC-001 | Reads via Zero, no convex/react | AC-1 | e2e-automated | app + Zero | lists load from PG; grep: 0 `convex/react` in app dirs |
| T-SYNC-002 | Mutations reactive within a tick | AC-2 | e2e-automated | app + Zero | send/add/submit reflects within one sync tick |
| T-SYNC-003 | Cold-start without CONVEX_URL | AC-3 | e2e-automated | app | boots with Zero provider, no `EXPO_PUBLIC_CONVEX_URL` |
| T-SYNC-004 | Share URL points to new host | AC-4 | build-gate | repo | no `.convex.cloud`→`.convex.site` rewrite remains |

### UC-SYNC-02: Reactive surfaces
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SYNC-005 | Live mission progress on app | AC-1 | e2e-automated | app + Zero | progress updates as workflow advances |
| T-SYNC-006 | SSE tokens + durable consistency | AC-2 | e2e-automated | app | tokens stream; final matches Zero-synced message |
| T-SYNC-007 | Cross-surface change reflects | AC-3 | e2e-automated | app + MCP | MCP doc update appears on app within a tick |

### UC-SYNC-03: Big-bang cutover
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SYNC-008 | New stack validated, Convex untouched | AC-1 | integration-test | both stacks | integration suite green while Convex serves prod |
| T-SYNC-009 | Freeze + ETL parity report | AC-2 | human-gate | export + PG | frozen, ETL run, parity report green |
| T-SYNC-010 | Full end-to-end from new backend | AC-3 | e2e-automated | flipped stack | app + 44 tools + /article + crons pass on real services |
| T-SYNC-011 | MCP off convex/browser | AC-4 | build-gate | repo | client rewritten; no `convex/browser` import |

### UC-SYNC-04: Rollback plan
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SYNC-012 | Convex live + pinned build through soak | AC-1 | human-gate | soak window | deployment un-deleted; fallback build pinned |
| T-SYNC-013 | Config re-point, zero data loss | AC-2 | human-gate | rollback drill | re-point to Convex succeeds; no committed-data loss |
| T-SYNC-014 | Point of no return identified | AC-3 | human-gate | plan | deletion occurs only after clean soak |

### UC-SYNC-05: Convex decommission
| # | Criterion | AC | Type | Setup | Pass/Fail |
|---|-----------|----|------|-------|-----------|
| T-SYNC-015 | grep convex clean | AC-1 | build-gate | repo | 0 hits across app/MCP dirs + both package.json |
| T-SYNC-016 | Builds without Convex/Cohere deps | AC-2 | build-gate | repo | app builds + MCP starts, deps removed |
| T-SYNC-017 | Dead clients deleted, playground archived | AC-3 | build-gate | repo | python/, cli/ gone; ratatui archived |
| T-SYNC-018 | Convex deployment deleted last | AC-4 | human-gate | cloud | deletion after soak; no Convex surface reachable |

## Summary

| Type | Count |
|------|-------|
| integration-test | 61 |
| build-gate | 11 |
| e2e-automated | 9 |
| human-gate | 8 |
| api-contract | 1 |
| **Total criteria** | **90** |

Every AC in every UC is covered by ≥1 criterion. Integration criteria run against real Postgres + Mastra + fleet per the harness constitution; the RN e2e lane and the ETL/parity gates are provisioned as leading INFRA work.
