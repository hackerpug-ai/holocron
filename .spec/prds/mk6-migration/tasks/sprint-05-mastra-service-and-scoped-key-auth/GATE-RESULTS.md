# Gate Results: sprint-05-mastra-service-and-scoped-key-auth

## VERIFIED — recomputed pass == claimed pass; 7/7 recomputed; 0 discrepancies

**Proof:** `gate-verification.json`

---

**Date:** 2026-07-15
**Sprint:** sprint-05-mastra-service-and-scoped-key-auth (Mastra Service and Scoped-Key Auth)
**Environment:** Mastra/Bun service on :4111, Postgres `holocron` DB on :5432, LiteLLM fleet on :4545
**Exec pane:** surface:259 (F5F568C1-6ED2-4B03-9463-434D1B34C178)
**Service pane:** surface:255 (0568E178-C15C-4FEB-8697-31D22E29DD64)
**UI driver:** none (all steps are API/terminal — no UI steps in this gate)
**QA surface:** BD099342-E3B6-464D-85AE-758EFCFD99EA

---

## Summary

| Result | Count |
|--------|-------|
| Pass   | 7     |
| Fail   | 0     |
| Wiring Gap | 0 |

**Verdict: PASS**

---

## Per-Step Results

| # | Gate Step | Method | Result | Evidence |
|---|-----------|--------|--------|----------|
| 1 | `curl /health` — 200 with DB/fleet/queue readiness | real-api | PASS | `status:ok`, `db.ready:true`, `fleet.ready:true`, `queue.ready:true` — HTTP_200 — HEALTH_OK |
| 2 | `curl POST /api/missions/x/steer` with no key — 401 | real-api | PASS | `{"error":"unauthorized","message":"missing or invalid Authorization Bearer token"}` — HTTP_401 |
| 3 | `curl POST /api/missions/x/steer` with RN key — 200 | real-api | PASS | `{"ok":true,"scope":"rn"}` — HTTP_200 |
| 4 | `curl POST /mcp` with RN key (wrong scope) — 403 | real-api | PASS | `{"error":"forbidden","message":"scope 'rn' is not allowed for /mcp"}` — HTTP_403 |
| 5 | `holo registry:probe searchTool` — shared Zod schema | real-cli | PASS | `resolvedId: search_tools`, all three consumers `inputSame=true`, `schemaRef: shared` — PROBE_OK |
| 6 | `holo verify:no-dup-validation` — duplicates absent | real-cli | PASS | `duplicates:0`, `scannedCount:20`, `sites:[]` — NO_DUP_OK |
| 7 | `holo manifest:resolve divergent` — live fleet endpoint | real-cli | PASS | `endpoint:http://127.0.0.1:4545`, `healthy:true` — RESOLVE_OK |

---

## Evidence Logs

All step logs are durable at `/tmp/holocron-gate-sprint-05-mastra-service-and-scoped-key-auth/`:

- `step1.log` — /health probe (cmd_sha verified)
- `step2.log` — unkeyed 401 (cmd_sha verified)
- `step3.log` — keyed 200 (cmd_sha verified)
- `step4.log` — wrong-scope 403 (cmd_sha verified)
- `step5.log` — registry:probe shared schema (cmd_sha verified)
- `step6.log` — no-dup-validation (cmd_sha verified)
- `step7.log` — manifest:resolve fleet endpoint (cmd_sha verified)
- `service.log` — service startup output

---

## Failures

None.

---

## Wiring Gaps

None.

---

## Verification

```
verify-gate-evidence.sh:
  verified: true
  claimed_verdict: pass
  recomputed_verdict: pass
  steps_planned: 7
  steps_recomputed: 7
  discrepancies: []
```

All 7 steps executed against the real Mastra service on :4111. Every step's `cmd_sha` was verified against the gate-plan.json literal command — no substitute commands were run. Every step's exit code, log regex, and @@GATE-EXIT trailer were deterministically recomputed.
