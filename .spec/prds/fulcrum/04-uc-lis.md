---
stability: FEATURE_SPEC
last_validated: 2026-08-20
prd_version: 3.0.0
functional_group: LIS
---

# Use Cases: Local Inference Substrate (LIS)

> **v3.0.0 fleet alignment (2026-08-20).** Per [ADR-007](./09-technical-requirements/00-architecture-decisions.md), Fulcrum is an ordinary **fleet client**: one loopback endpoint, fleet **role names** only, pinned to `inference1` + `inference2`. Per [ADR-008](./09-technical-requirements/00-architecture-decisions.md), its vocabulary is **research + embedding** — the coder roles (`reviewer`, `implementer`, `orchestrator`, `qwen-coder`, `verifier`) are gone. UC-LIS-03 previously specified a tailnet worker; that was retired by ADR-006 and is replaced here by **swap-and-measure**, the capability that makes the model↔role binding a config decision backed by a deterministic number.

| ID | Title | Description |
|----|-------|-------------|
| UC-LIS-01 | Consume inference through the fleet's loopback router | All Fulcrum inference goes to one loopback endpoint that routes only to `inference1` + `inference2` |
| UC-LIS-02 | Address research work by fleet role | Phases resolve fleet role names, never models, hosts, or devices |
| UC-LIS-03 | Swap and measure the model behind a role | The binding is a fleet config edit, scored by a deterministic oracle |
| UC-LIS-04 | Degrade per role, never substitute | A role with no reachable backend fails loudly; the loop never silently changes models |
| UC-LIS-05 | Record inference telemetry from router-truthful sources | Every call records what actually served it, read from headers rather than the response body |

---

## UC-LIS-01: Consume inference through the fleet's loopback router

Fulcrum holds no endpoint configuration. It dials `http://127.0.0.1:{router_port}/v1` on the node it runs on, and that node's packaged router is declared with `node_set: ["inference1", "inference2"]` so every Fulcrum call is served by an always-on mini. The laptop is not in the pool and is not a dependency.

**Acceptance Criteria**

- ☐ System completes a real Fulcrum cycle generation against the loopback router endpoint on its host node
- ☐ System routes every Fulcrum cycle inference call to `inference1` or `inference2`, verified by the serving api-base recorded for each call
- ☐ System never routes a Fulcrum cycle call to the laptop, verified across a full cycle with the laptop reachable and serving
- ☐ Operator can move Fulcrum to a different fleet node without editing Fulcrum, because the endpoint is loopback on every node
- ☐ System exposes no configuration key for an inference base URL, host, port, or device

## UC-LIS-02: Address research work by fleet role

Fulcrum names three fleet roles — `fulcrum-assay` (chat), `fulcrum-challenge` (chat), and `qwen3-embedding` (1024-dim embedding). It never names a model file, a quantization, or a machine. Because roles are fleet-wide and a node cannot redefine them, the same role name means the same model on every node.

**Acceptance Criteria**

- ☐ System resolves each cycle phase to a fleet role, with ASSAY using `fulcrum-assay` and SENSE-planning, GENERATE, and CHALLENGE using `fulcrum-challenge`
- ☐ System guarantees `fulcrum-assay` and `fulcrum-challenge` resolve to two different served models, and refuses to run the cycle when they would be identical
- ☐ System verifies the ASSAY-versus-CHALLENGE distinctness against the model each call actually resolved to, not against the configured role names alone
- ☐ System names no coder role anywhere on the Fulcrum path, verified by inspection of the running configuration
- ☐ System uses `qwen3-embedding` only for embedding and never as a chat model, and never substitutes a chat role for the embedder

## UC-LIS-03: Swap and measure the model behind a role

The model serving a Fulcrum role is a fleet config edit, and the choice is settled by measurement rather than opinion. The Evidence Gate already produces deterministic quality signals, so a swap can be scored without a human reading prose and without a model judging a model.

**Acceptance Criteria**

- ☐ Operator can change the model behind `fulcrum-assay` or `fulcrum-challenge` by editing fleet configuration, with no change to Fulcrum code and no redeploy
- ☐ System reports an ASSAY quality score as the quote-check pass rate — the share of extracted claims whose quote is verified present in the fetched source
- ☐ System reports a CHALLENGE quality score as the gate-pass rate of refuting claims produced by the challenge pass
- ☐ Operator can compare two model bindings over the same set of source material and see both scores side by side
- ☐ System computes both scores in deterministic code with no model call anywhere in the measurement path
- ☐ System records which model binding produced each cycle, so a historical quality score stays attributable

## UC-LIS-04: Degrade per role, never substitute

Node health, mini-to-mini failover, and cooldown belong to the router. What Fulcrum sees is a served response, an explicit no-host error naming the role, or a refused connection. When a role has no backend the loop reduces its own activity and says so — it never reaches for a different role, and never for a cloud model unless the operator has explicitly opted in.

**Acceptance Criteria**

- ☐ System continues running cycles when one mini is unreachable, because the router fails over to the other
- ☐ System enters a defined reduced mode when the chat roles have no reachable backend, rather than substituting another role or calling a cloud model
- ☐ System never retries a failed role by requesting a different role name, verified by the roles requested during an induced outage
- ☐ Operator can see the current per-role availability in the daily brief and loop health, named by role rather than by host
- ☐ System uses a cloud model for research only when the Operator has explicitly enabled a fallback
- ☐ System records an explicit reason when a cycle is reduced or skipped for role unavailability, never a silent non-run

## UC-LIS-05: Record inference telemetry from router-truthful sources

Every cycle records what inference it consumed and, critically, **what actually served it**. The response body's `model` field is not evidence: the router rewrites it to the requested alias, so a body-field check would report success against a live substitution.

**Acceptance Criteria**

- ☐ System records, per cycle phase, the tokens consumed, wall-clock time, fleet role, and the backend that actually served the call
- ☐ System reads the serving backend from the router's response headers cross-referenced against its deployment info, never from the response body's model field
- ☐ System records the resolved model identity for each chat call, so the ASSAY-versus-CHALLENGE distinctness can be audited after the fact
- ☐ Operator can view aggregate inference telemetry per mission, including tokens per day, cycles per day, and the per-role split
- ☐ System exposes per-cycle telemetry to the budget enforcement in CYC so a budget-exceeded cycle is detectable from recorded numbers
- ☐ System records embedding calls with their vector dimensionality, because the embedding response carries no model identifier to record
