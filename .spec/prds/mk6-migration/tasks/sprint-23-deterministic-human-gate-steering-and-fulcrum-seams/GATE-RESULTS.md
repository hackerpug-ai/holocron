# Gate Results: sprint-23-deterministic-human-gate-steering-and-fulcrum-seams

## PASS (verified=true) — recomputed `pass` == claimed `pass`; 6/6 steps recomputed; 0 discrepancies

The claimed verdict **survives deterministic recomputation**. This is a **verified PASS**.

| Field | Value |
|-------|-------|
| Reviewed SHA | `9e66664410870b0db95b8f6fd21d8445d5f9f83c` |
| Branch | `main` |
| Evidence dir | `.gate-evidence/fresh-20260723T011617Z` |
| Run ID | `fresh-20260723T071617Z` |
| Verifier | `.gate-evidence/20260723T061322Z/verify-gate-evidence.sh` |
| Verified | `true` (0 discrepancies) |
| Quiescent tree | `true` (baseline SHA == final SHA) |
| Exec surface | local-only: `:4111` + fleet `:4546` + pg `holocron_nonprod` / `holocron` |

> **LANDING NOTE (review/qa stage):** This verdict does not land work. The run stage merges the reviewed commit to `main` after approval. The exact SHA reviewed is `9e66664410870b0db95b8f6fd21d8445d5f9f83c`.

## Per-step results

| Step | Text | Exit | Regex | Not-regex | Result |
|------|------|------|-------|-----------|--------|
| 1 | Uncited kill rejected | 0 | `UNCITED_KILL_REJECTED` found | `MISSION_NOT_FOUND` absent | PASS |
| 2 | Concurrent WIP=1 refused | 0 | `"code":"WIP_ONE_EXCEEDED"` found (body) | `NO_WIP_IN_BURST` absent | PASS |
| 3 | Probe-ready poll + refuse→accept advance | 0 | `STEP3_PROOF=refused_then_ok` found | `MISSION_NOT_FOUND` absent | PASS |
| 4 | Mid-run steer | 0 | `"eventType":"steer"` found | `MISSION_NOT_FOUND` absent | PASS |
| 5 | mission:cycle ASSAY≠CHALLENGE | 0 | `"assayChallengeDistinct": true` found | `MISSION_NOT_FOUND` absent | PASS |
| 6 | fulcrum:authorable-check | 0 | `SUFFICIENT` found | `INSUFFICIENT` absent | PASS |

## Fresh evidence highlights

All run IDs created at gate time — no hard-coded UUIDs.

- **Step 1** — Fresh `test.echo` run `019f8dd5-fe98-...`; POST uncited kill → HTTP 422 `{"ok":false,"code":"UNCITED_KILL_REJECTED"}`.
- **Step 2** — 6-way concurrent burst on identical (research, goal). `OK_COUNT=1 WIP_BODY_COUNT=5`. R1 won (HTTP 200, suspended); R2–R6 refused (HTTP 403, body `"code":"WIP_ONE_EXCEEDED"`). Split-constructed `STEP2_PROOF=ok+wip_body`.
- **Step 3** — Fresh echo `019f8dd6-b345-...` + research `019f8dd6-b43f-...`. Bounded poll reached `POLL_PLAN_STAGE=committed` → `STEP3_PROBE_READY` (GATE-FIX-005). ARM_A (unprobed echo): `PROBE_REQUIRED_FOR_VALIDATED`. ARM_B (probed research): `"ok":true`. Split-constructed `STEP3_PROOF=refused_then_ok` (GATE-FIX-004 — success token does not appear contiguously in literal_cmd).
- **Step 4** — Fresh research `019f8dd7-3816-...`; POST steer → HTTP 200, event `"eventType":"steer"` written.
- **Step 5** — Fresh research `019f8dd7-c487-...`; `holo mission:cycle` → `"assayChallengeDistinct": true` (whitespace-tolerant).
- **Step 6** — `holo fulcrum:authorable-check` → `Overall: SUFFICIENT — fulcrum can be authored with zero new platform code`.

## Method

All six `literal_cmd`s from `gate-plan.json` executed verbatim against local-only services (`http://127.0.0.1:4111`, fleet `http://127.0.0.1:4546`, manifest `/tmp/holocron-fleet-local-valid.json`, nonprod DB). No cloud fallback; no ledger seeding by QA. Each step log stamps `cmd_sha=<sha256(literal_cmd)>` for verifier fidelity. The verifier recomputes exit code + expect/not-regex independently from raw `.log` + `.exit` files.

## Caveats

None.
