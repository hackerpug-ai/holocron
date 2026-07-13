---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 2.0.0
---

# E2E Harness Constitution

The human-testing-gate substrate. Today the app has **no device e2e** and the backend tests are Convex-bound (they die with Convex). This harness must be **provisioned** as a leading INFRA task before feature sprints can close.

## Framework per surface

| Surface | Framework | Status |
|---------|-----------|--------|
| Mastra service | **Vitest integration** booting a REAL Bun Mastra server + REAL Postgres + REAL fleet | PROVISION (extend existing `vitest.config.ts` + `tests/integration/`) |
| MCP server | Vitest spawning the REAL stdio server and Streamable HTTP mount, exercising all 44 manifest-backed contracts against REAL Postgres | PROVISION |
| Data / ETL | Vitest gates against REAL Postgres + pgvector + fleet (catalog reconciliation, FK integrity, jsonb round-trip, vector sanity, search parity/uplift, blob integrity) | PROVISION |
| RN mobile app | **Maestro on a named iOS Simulator with an Expo development build** driving the REAL app against the REAL Mastra/Zero backend | PROVISION (none today) |
| Public `/article/` | HTTP integration test byte-comparing rendered HTML | PROVISION |

## The determinism seam

For agentic surfaces (chat, research, missions) the model output is nondeterministic — so tests **fixture the model/role signal and assert the engine's deterministic OUTCOMES**, not model prose:
- Assert the **evidence gate's admission/termination decision** given fixed claims+evidence (pure TS — fully deterministic).
- Assert **mission state transitions**, **commit atomicity** (kill-9 → no partial rows), **budget-ceiling blocks**, **human-gate rejections**, and **degraded-mode fallback** — all deterministic code paths.
- Fixture fleet responses where the *test* is about orchestration; use the **real fleet** where the test is about inference quality (eval scorers).

## Real-service mandate

No mocked Postgres, no mocked fleet, no mocked Mastra. The "REAL Postgres + REAL Mastra + REAL fleet" harness is the acceptance substrate for every integration-tier AC in this PRD. Convex-bound tests (34 `tests/convex/*` + 10 `convex/**/*.test.ts`) are **re-authored** against Postgres/Mastra — budget for it explicitly.

## Proven-reference-flow gate (the spike)

Before the deep build, one end-to-end flow must be proven green on the real harness: **cold-boot → app opens → send a chat message → specialist runs on the fleet → tool call hits Postgres → durable message syncs to the app via Zero.** It runs on a named iPhone simulator and Expo development build, with tailnet DNS/TLS configured, a dedicated nonproduction Postgres/Zero namespace, deterministic seed/reset, stable journey `testID`s, and screenshot/JUnit/log/video artifacts. If that reference flow can't be proven, the harness is incomplete and feature sprints do not start.

## CI lanes

- **fast:** unit/pure (evidence gate, RRF fusion, chunker, id-remap) — every commit.
- **integration:** real Postgres + Mastra + fleet — pre-merge.
- **e2e:** Maestro RN journeys + full cutover cold-boot — pre-sprint-gate; runs from the declared macOS runner host against the dedicated nonproduction namespace.
- **flake policy:** quarantine + fix within the sprint; no silent retries masking nondeterminism.
