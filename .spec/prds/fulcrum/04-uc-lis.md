---
stability: FEATURE_SPEC
last_validated: 2026-07-12
prd_version: 1.0.0
functional_group: LIS
---

# Use Cases: Local Inference Substrate (LIS)

| ID | Title | Description |
|----|-------|-------------|
| UC-LIS-01 | Route research calls to local inference | Fulcrum cycle work calls a local OpenAI-compatible endpoint instead of the cloud `claudeFlash()` factory |
| UC-LIS-02 | Map research roles to local models | Divergent and convergent roles resolve to configured local models, not hardcoded |
| UC-LIS-03 | Run inference from a tailnet worker | Cycle inference executes where local endpoints are reachable (dev laptop / prod mini) |
| UC-LIS-04 | Degrade visibly on fleet loss | When the fleet or a node is unreachable, the loop enters a defined reduced mode and surfaces it |
| UC-LIS-05 | Record inference telemetry | Every cycle records tokens, wall time, endpoint, and model role per phase |

---

## UC-LIS-01: Route research calls to local inference

The substrate exposes a research model provider that targets a local OpenAI-compatible server (LiteLLM router at the laptop in dev; Mac-mini `llama-server` in prod). All Fulcrum cycle LLM calls use it; the cloud `claudeFlash()` factory is not on the Fulcrum path.

**Acceptance Criteria**
- ☐ System can complete a real generation against the configured local endpoint for a Fulcrum cycle call
- ☐ Operator can point the substrate at a local endpoint via configuration (base URL + model names) without code changes
- ☐ System routes every Fulcrum cycle LLM call through the local provider (no cloud provider invoked on the cycle path unless the Operator explicitly opts into a fallback)
- ☐ System records which endpoint served each call for later audit

## UC-LIS-02: Map research roles to local models

Fulcrum needs two research roles — **divergent** (fast generation, query planning, mutation) and **convergent** (precise claim extraction, scoring inputs, challenge). These map onto locally-served models (e.g., divergent → the fast MoE `implementer`; convergent → the precise dense `reviewer`) via config.

**Acceptance Criteria**
- ☐ Operator can declare, in configuration, which local model serves the divergent role and which serves the convergent role
- ☐ System resolves a phase's model from its role at call time (ASSAY→convergent, GENERATE/SENSE-planning→divergent, CHALLENGE→the role NOT used by ASSAY)
- ☐ System guarantees ASSAY and CHALLENGE resolve to different models, and fails closed (does not run the cycle) if they would be identical
- ☐ Operator can change the role→model mapping without changing cycle code

## UC-LIS-03: Run inference from a tailnet worker

Because Convex's runtime cannot reach tailnet-local endpoints, inference-bearing cycle phases execute in a **tailnet-resident worker** (dev: laptop; prod: Mac mini) that holds the local-model connection and reads/writes durable state through Convex.

**Acceptance Criteria**
- ☐ System can execute a cycle's inference phases from the tailnet worker against a local endpoint unreachable from Convex's own runtime
- ☐ Worker can read the next work item and write cycle results back to the Convex ledger
- ☐ System dispatches cycle work to the worker via a durable queue/trigger so a worker restart loses at most the in-flight cycle
- ☐ Operator can run the worker on the laptop in dev and on a Mac mini in prod with only configuration differing

## UC-LIS-04: Degrade visibly on fleet loss

When the fleet is degraded (one mini down) or fully unreachable (both down / Wi-Fi off), the loop must not silently swap to a cloud model. It enters a defined reduced mode and reports it.

**Acceptance Criteria**
- ☐ System detects an unreachable local endpoint within a bounded time and marks the fleet state degraded or offline
- ☐ System continues on remaining healthy local endpoints when the fleet is degraded (one node down)
- ☐ System drops the loop to a reduced mode (no new generative cycles) when no local endpoint is reachable, rather than calling a cloud model
- ☐ Operator sees the current fleet/degradation state in the daily brief and loop health
- ☐ System uses a cloud model for research only when the Operator has explicitly enabled a fallback

## UC-LIS-05: Record inference telemetry

Every cycle records what inference it consumed, so the operator can see cost/throughput and so the cycle budget (CYC) can be enforced against real numbers.

**Acceptance Criteria**
- ☐ System records, per cycle, the tokens consumed, wall-clock time, endpoint, and model role for each inference phase
- ☐ Operator can view aggregate inference telemetry (tokens/day, cycles/day, per-role split) for a mission
- ☐ System exposes per-cycle telemetry to the budget enforcement in CYC so a budget-exceeded cycle is detectable from recorded numbers
