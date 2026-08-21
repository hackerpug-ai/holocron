---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: LIS
---

# Use Cases: Local Inference Substrate (LIS)

> **v3.0.0.** Per [ADR-007](./09-technical-requirements/00-architecture-decisions.md), Fulcrum is an ordinary **fleet client**: one loopback endpoint, live **role names** only (`divergent` / `convergent` / `embed`), pinned to `inference1` + `inference2`. Per [ADR-008](./09-technical-requirements/00-architecture-decisions.md), `judge` is forbidden and coder roles are gone. Optional `fleet.json` aliases `fulcrum-assay` → `divergent` and `fulcrum-challenge` → `convergent` map 1:1; they are not a third vocabulary. UC-LIS-03 is **swap-and-measure** with a denominator floor and the second CHALLENGE signal (kill-question later yields admitted disconfirm).

| ID | Title | Description |
|----|-------|-------------|
| UC-LIS-01 | Consume inference through the fleet's loopback router | All Fulcrum inference goes to one loopback endpoint that routes only to `inference1` + `inference2` |
| UC-LIS-02 | Address research work by live fleet role | Phases resolve `divergent` / `convergent` / `embed`, never models, hosts, devices, or `judge` |
| UC-LIS-03 | Swap and measure the model behind a role | The binding is a fleet config edit, scored by a deterministic oracle with a denominator floor |
| UC-LIS-04 | Degrade per role, never substitute | A role with no reachable backend fails loudly; the loop never silently changes models |
| UC-LIS-05 | Record inference telemetry from router-truthful sources | Every call records what actually served it, read from headers rather than the response body |

---

## UC-LIS-01: Consume inference through the fleet's loopback router

Fulcrum holds no endpoint configuration. It dials `http://127.0.0.1:{router_port}/v1` on the node it runs on, and that node's packaged router is declared with `node_set: ["inference1", "inference2"]` so every Fulcrum call is served by an always-on mini. The laptop is not in the pool and is not a dependency.

**Acceptance Criteria**

- ☐ System completes a real Fulcrum cycle against the loopback router endpoint on its host node, leaving a committed `mission_runs` row
- ☐ System routes every Fulcrum cycle inference call to `inference1` or `inference2`, verified by the serving api-base header recorded for each call
- ☐ System never routes a Fulcrum cycle call to the laptop, verified across a full cycle with the laptop reachable and serving
- ☐ Operator can move Fulcrum to a different fleet node and run a cycle with **zero Fulcrum config diff** (the endpoint is loopback on every node)
- ☐ System exposes no configuration key for an inference base URL, host, port, or device

---

## UC-LIS-02: Address research work by live fleet role

Fulcrum names three live `FLEET_ROLE_NAMES` — `divergent` (chat, ASSAY/extract), `convergent` (chat, SENSE-plan / GENERATE / CHALLENGE), and `embed` (1024-dim embedding). Optional aliases `fulcrum-assay` / `fulcrum-challenge` map 1:1 onto those names. It never names a model file, a quantization, a machine, a coder role, or `judge`. Because roles are fleet-wide and a node cannot redefine them, the same role name means the same model on every node.

**Acceptance Criteria**

- ☐ System resolves each cycle phase to a live fleet role, with ASSAY/extract using `divergent` (alias `fulcrum-assay` optional) and SENSE-planning, GENERATE, and CHALLENGE using `convergent` (alias `fulcrum-challenge` optional)
- ☐ System guarantees `divergent` and `convergent` resolve to two different served models, and refuses to run the cycle when they would be identical
- ☐ System verifies the ASSAY-versus-CHALLENGE distinctness against the model each call actually resolved to, not against the configured role names alone
- ☐ System names no coder role **and no `judge`** anywhere on the Fulcrum path, verified by inspection of the running configuration and of every requested role name
- ☐ System uses `embed` only for embedding and never as a chat model, and never substitutes a chat role (or `judge`) for the embedder

---

## UC-LIS-03: Swap and measure the model behind a role

The model serving a Fulcrum role is a fleet config edit, and the choice is settled by measurement rather than opinion. The Evidence Gate already produces deterministic quality signals, so a swap can be scored without a human reading prose and without a model judging a model. **A 1-claim or 1-refuter run cannot score 100% as a measurement.**

**Acceptance Criteria**

- ☐ Operator can change the model behind `divergent` or `convergent` (or their 1:1 aliases) by editing fleet configuration, with no change to Fulcrum code and no redeploy
- ☐ System reports an ASSAY quality score as the quote-check pass rate — verified-quote claims ÷ extracted claims — computed over a **held-out source pack** of at least **5 distinct sources** and at least **20 extracted claim attempts**. A run with denominator < 20 is reported as `insufficient_n`, not as a pass rate
- ☐ System reports a CHALLENGE quality score as the gate-pass rate of refuting claims produced by the challenge pass, over at least **10 refuter attempts**. A run with denominator < 10 is `insufficient_n`, not 100%
- ☐ System reports a second CHALLENGE signal: the rate at which a queued **kill-question later yields an admitted disconfirming claim** (ADR-008). Same denominator floor as the refuter gate-pass rate
- ☐ Operator can compare two model bindings over the same held-out source pack and see all three scores side by side
- ☐ System computes all three scores in deterministic code with no model call anywhere in the measurement path (no `generateText`, no fleet role, no `judge`)
- ☐ System records which model binding produced each cycle, so a historical quality score stays attributable

---

## UC-LIS-04: Degrade per role, never substitute

Node health, mini-to-mini failover, and cooldown belong to the router. What Fulcrum sees is a served response, an explicit no-host error naming the role, or a refused connection. When a role has no backend the loop reduces its own activity and says so — it never reaches for a different role (including `judge`), and never for a cloud model unless the operator has explicitly opted in.

**Acceptance Criteria**

- ☐ System continues running cycles when one mini is unreachable, because the router fails over to the other
- ☐ System enters a defined reduced mode when the chat roles have no reachable backend, rather than substituting another role or calling a cloud model
- ☐ System never retries a failed role by requesting a different role name, verified by the roles requested during an induced outage
- ☐ Operator can see the current per-role availability in the daily brief, section **Loop health**, named by role (`divergent` / `convergent` / `embed`) rather than by host
- ☐ System uses a cloud model for research only when the Operator has explicitly enabled a fallback
- ☐ System records an explicit reason when a cycle is reduced or skipped for role unavailability, never a silent non-run

---

## UC-LIS-05: Record inference telemetry from router-truthful sources

Every cycle records what inference it consumed and, critically, **what actually served it**. The response body's `model` field is not evidence: the router rewrites it to the requested alias, so a body-field check would report success against a live substitution.

**Acceptance Criteria**

- ☐ System records, per cycle phase, the tokens consumed, wall-clock time, fleet role, and the backend that actually served the call on `mission_stage_runs`
- ☐ System reads the serving backend from the router's response headers cross-referenced against its deployment info, never from the response body's model field
- ☐ System records the resolved model identity for each chat call, so the ASSAY-versus-CHALLENGE distinctness can be audited after the fact
- ☐ Operator can view aggregate inference telemetry per mission, including tokens per day, cycles per day, and the per-role split, in the daily brief **Loop health** section
- ☐ System exposes per-cycle telemetry to the budget enforcement in CYC so a budget-exceeded cycle is detectable from recorded numbers
- ☐ System records embedding calls with their vector dimensionality, because the embedding response carries no model identifier to record
