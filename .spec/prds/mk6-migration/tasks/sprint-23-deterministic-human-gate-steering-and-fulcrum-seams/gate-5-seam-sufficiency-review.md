# Mastra Review — Sprint 23 gate-5 (Seam Sufficiency)

**Verdict**: **APPROVE**

**Task**: `gate-5` — CHORE: produce a seam-sufficiency review report  
**Agent**: `mastra-reviewer`  
**Branch**: `kb-run-sprint/sprint-23/gate-5`  
**Base**: main with gate-1 / gate-2 / gate-3 landed (`09d1341d`)  
**Reviewed at**: 2026-07-22  
**TDD mode**: skipped (review-only chore)

---

## Executive summary

Sprint 23 hardens existing surfaces; fulcrum is an **alias** of `evidence-research`, not a new template. All **5 seams** from gate-3 `holo fulcrum:authorable-check` resolve to real file:line surfaces that exist on disk and (for schema seams) in live Postgres. Deterministic human-gate rules are **Postgres-enforced** via `SECURITY DEFINER` trigger + partial unique index (handlers map errors; they do not re-implement the rules). ASSAY≠CHALLENGE instance IDs are minted as real `fleet:model:<model>:inst-<uuid>` values and persisted as `mission_stage_runs.trace_id` / stage `output_json`. The pure-TS evidence gate has **no** LLM / Mastra generate-stream surfaces.

Evidence pack: `.tmp/gate-5/` (`authorable-check.txt`, `verification-commands.txt`, supporting greps).

---

## HIGH (must fix)

*None.*

---

## MEDIUM (fix soon)

*None blocking ship.*

### MEDIUM-note (non-blocking): TC-4 contract grep path vs mint site

- Contract verify string greps `services/platform/src/research/inspection.ts` for `fleet:model:.*inst-`.
- Mint lives at [`services/platform/src/mission/cycle.ts:104`](services/platform/src/mission/cycle.ts) (`mintFleetInstanceId`).
- Inspection **consumes** fleet IDs from committed stage outputs ([`inspection.ts:127-140`](services/platform/src/research/inspection.ts)), not literal mint strings.
- **Behavioral intent of AC-4 is satisfied** (real fleet IDs, not hardcoded `assay-instance` / `challenge-instance`). Future contract polish: point TC-4 at `cycle.ts` **or** assert both mint + inspection consumption.

---

## LOW (track)

1. **Gate-3 verification surface is new code, not a fulcrum template.**  
   Commit `1579b9aa` added `fulcrum-authorable-check.ts` + CLI wiring + tests. That is expected proof tooling for gate-3; it is **not** a `templateKey: 'fulcrum'` product path. AC-3 “zero new platform code” is satisfied for the **fulcrum runtime/template** claim (alias → `evidence-research` only).

2. **Full mission executor path uses a different instance-id shape.**  
   [`runtime.ts`](services/platform/src/mission/runtime.ts) uses `${modelRevision}:assay|challenge:${run.id}` for the long mission graph, while gate-2 cycle path uses `fleet:model:…:inst-…`. Both are dynamic (not hardcoded equality tokens). Track convergence if a single fleet-trace grammar is desired across paths.

3. **Role-bindings citation range is tight but correct.**  
   CLI cites `evidence-research.ts:88-89` which is `assay: 'divergent'` / `challenge: 'convergent'` (plan binding is line 87). No placeholder.

---

## AC validation

### AC-1: All 5 seams validated with concrete citations — **SATISFIED**

**Command** (worktree root):

```text
bun services/platform/src/cli/holo.ts fulcrum:authorable-check
```

**Captured output** (`.tmp/gate-5/authorable-check.txt`):

```text
contract-seam: PASS — mission_templates table exists (services/platform/src/db/schema/mission.ts:14)
ledger-seam: PASS — sources, passages, claims, beliefs tables exist (services/platform/src/db/schema/evidence.ts:32-150)
gate-seam: PASS — pure-TS gate exists (services/platform/src/research/evidence-gate.ts:55)
role-bindings-seam: PASS — assay=divergent, challenge=convergent (services/platform/src/mission/templates/evidence-research.ts:88-89)
publish-seam: PASS — documents table exists (services/platform/src/db/schema/documents.ts:31)
Overall: SUFFICIENT — fulcrum can be authored with zero new platform code
```

| Seam | Citation | Verified content |
|---|---|---|
| contract | `services/platform/src/db/schema/mission.ts:14` | `export const missionTemplates = pgTable('mission_templates', …)` |
| ledger | `services/platform/src/db/schema/evidence.ts:32-150` | `sources`@32, `passages`@56, `claims`@82, `beliefs`@150 |
| gate | `services/platform/src/research/evidence-gate.ts:55` | `export function evaluateEvidenceGate` pure-TS |
| role-bindings | `services/platform/src/mission/templates/evidence-research.ts:88-89` | `assay: 'divergent'`, `challenge: 'convergent'` |
| publish | `services/platform/src/db/schema/documents.ts:31` | `export const documents = pgTable('documents', …)` |

Additional compile-time checks inside authorable-check (not only string presence):

- Live Postgres `pg_tables` probe for `mission_templates`, ledger tables, `documents`.
- Gate rejects accidental `generateText` / `streamText` / `@mastra/core/agent` in `evidence-gate.ts`.
- Role-bindings require `'fulcrum'` listed as an **instantiation alias** of evidence-research (not a separate template key).
- Publish also requires `mission/document-publish.ts` exporting `publishDocumentForRun`.

**No** `TODO`, `verify manually`, or placeholder citations observed. `PASS` count with `file:line` = **5**.

---

### AC-2: Deterministic rules are Postgres-enforced — **SATISFIED**

Three gate-1 rules and their Postgres anchors:

| Rule | Postgres enforcement | Citation |
|---|---|---|
| Uncited kill rejected | `SECURITY DEFINER` function `enforce_mission_human_gate()` on `BEFORE INSERT` of `mission_verdicts`; raises `UNCITED_KILL_REJECTED` when `verdict='kill'` and citation missing / not a current belief (`beliefs.tx_to IS NULL`) | [`0025_deterministic_human_gate.sql:10-60`](services/platform/src/db/migrations/0025_deterministic_human_gate.sql), refreshed in [`0027_mission_human_gate_crash_boundary.sql`](services/platform/src/db/migrations/0027_mission_human_gate_crash_boundary.sql) |
| WIP=1 | Partial unique index `mission_runs_active_subject_wip_one_uidx` on `(template_key, goal)` WHERE `status IN ('pending','running','suspended') AND goal IS NOT NULL` | Migration `0025:4-7`; Drizzle mirror [`mission.ts:124-126`](services/platform/src/db/schema/mission.ts) |
| Probe-gated advance | Same `SECURITY DEFINER` function: `verdict='advance'` + `targetStatus='validated'` requires committed `mission_stage_runs` row with `stage_kind='research.plan@1'`; raises `PROBE_REQUIRED_FOR_VALIDATED` | `0025:35-47` / `0027:13-14` |

Idempotency unique indexes (run_id, request_key):

- `mission_verdicts_run_request_key_uidx` — [`mission.ts:331`](services/platform/src/db/schema/mission.ts)
- `mission_steering_run_request_key_uidx` — [`mission.ts:311`](services/platform/src/db/schema/mission.ts)
- `mission_verdict_rejections_run_request_key_uidx` — [`mission.ts:351`](services/platform/src/db/schema/mission.ts)

**Handler posture** ([`http/missions.ts`](services/platform/src/http/missions.ts)):

- Verdict path `INSERT`s into `mission_verdicts` and maps Postgres exceptions via `missionRuleViolationCode` (`UNCITED_KILL_REJECTED` / `WIP_ONE_EXCEEDED` / `PROBE_REQUIRED_FOR_VALIDATED`) to HTTP 422/403.
- **No** handler-side `SELECT … FROM beliefs` citation pre-check (grep empty) — enforcement is not handler-only.
- WIP uniqueness errors map from constraint name `mission_runs_active_subject_wip_one_uidx`.

Migration header is explicit: *“CHECK / SECURITY DEFINER enforcement is intentionally in Postgres, not HTTP handlers.”*

---

### AC-3: Zero new platform code for fulcrum (alias only) — **SATISFIED**

| Check | Result |
|---|---|
| `templateKey: 'fulcrum'` under `services/platform/src/mission/templates/` | **None** (`rg` empty for `templateKey.*fulcrum`) |
| Shared template key | `EVIDENCE_RESEARCH_TEMPLATE_KEY = 'evidence-research'` ([`evidence-research.ts:11,22`](services/platform/src/mission/templates/evidence-research.ts)) |
| Instantiation list includes fulcrum | `EVIDENCE_RESEARCH_INSTANTIATIONS` includes `'fulcrum'` ([`:13-17`](services/platform/src/mission/templates/evidence-research.ts)) |
| CLI alias | `holo.ts` case `'fulcrum'`: `templateKey: 'evidence-research'`, `instantiation = 'fulcrum'` ([`holo.ts:3965-4015`](services/platform/src/cli/holo.ts)); comments state never a new template key |
| Resolver | `resolveEvidenceResearchTemplateKey` maps aliases → `evidence-research` |

Gate-3 commit (`1579b9aa`) added compile/check CLI + tests only — **no** fulcrum template definition file, no duplicate stage graph. Authorable-check overall line: *“fulcrum can be authored with zero new platform code”*.

---

### AC-4: Instance IDs are real fleet values, not hardcoded — **SATISFIED**

**Mint** ([`mission/cycle.ts:98-105`](services/platform/src/mission/cycle.ts)):

```ts
function mintFleetInstanceId(modelId: string | null | undefined): string {
  // …
  return `fleet:model:${model}:inst-${randomUUID()}`;
}
```

**Per-cycle assignment** ([`cycle.ts:445-486`](services/platform/src/mission/cycle.ts)):

- Assay and challenge each call `runFleetModelCall` with a **distinct** `traceId: mintFleetInstanceId(...)`.
- Instance IDs taken from `telemetry.traceId` (fallback mint).
- Hard fail on missing IDs or `assayInstanceId === challengeInstanceId` (`MISSION_ASSAY_CHALLENGE_COLLISION`).

**Persistence** ([`cycle.ts:277,301`](services/platform/src/mission/cycle.ts)): `instanceId` written to `mission_stage_runs.trace_id` and into stage `output_json` (`instanceId` / `challengeInstanceId`).

**Inspection consumption** ([`research/inspection.ts:127-140`](services/platform/src/research/inspection.ts)): reads committed stage outputs — no hardcoded `'assay-instance'` / `'challenge-instance'`.

**Real fleet traces from gate-2 artifacts** (`.tmp/gate-2/artifacts/`):

| Artifact | assayInstanceId | challengeInstanceId |
|---|---|---|
| `gate-4-assay-challenge-real-fleet-cycle.json` | `fleet:model:implementer:inst-50eafe7f-9b9b-4a85-a09d-9792c78a2014` | `fleet:model:reviewer:inst-5b2def9c-8f05-40e2-a9ba-ae710597f268` |
| `gate-4-cli-instance-ids-cycle.json` | `fleet:model:implementer:inst-e780b89d-c9ce-4fcb-82ae-f1d9f92f92be` | `fleet:model:reviewer:inst-bfd4ae67-399b-4818-ad44-caddaed5be9d` |
| `gate-4-admission-parity-real-cycle.json` | `fleet:model:implementer:inst-b8755f07-5072-49d5-beda-c79a00f76dcc` | `fleet:model:reviewer:inst-ca911d46-7562-42eb-83ad-df661e092059` |

All pairs are unequal; all match `fleet:model:.*inst-.*`; admission reports `pureTs: true`.

---

## Pure-TS evidence gate (extra MUST)

| Check | Result |
|---|---|
| `rg generate(|stream(|generateText|streamText|@mastra|openai/|model:` on `evidence-gate.ts` | **Empty** |
| File header / comment | “model calls never occur” ([`:51-54`](services/platform/src/research/evidence-gate.ts)) |
| Implementation | Zod parse + pure filters / sets only ([`:55-103`](services/platform/src/research/evidence-gate.ts)) |
| Cycle admission | `evaluateEvidenceGate(evidence)` with `admission.pureTs: true` ([`cycle.ts:489-511`](services/platform/src/mission/cycle.ts)) |

---

## Test criteria

| ID | Statement | Result | Evidence |
|---|---|---|---|
| TC-1 | All seam citations are concrete file:line | **PASS** | `authorable-check` → 5 `PASS — …:line` matches (`.tmp/gate-5/authorable-check.txt`) |
| TC-2 | Deterministic rules use Postgres enforcement | **PASS** | `SECURITY DEFINER` + WIP unique index + trigger in migrations `0025`/`0027`; Drizzle unique indexes in `mission.ts` |
| TC-3 | Fulcrum uses existing template only | **PASS** | No `templateKey` fulcrum; CLI forces `evidence-research` |
| TC-4 | Instance IDs match fleet pattern | **PASS** | Mint `cycle.ts:104`; real IDs in gate-2 artifacts; inspection reads stage outputs (see MEDIUM-note on contract path) |

---

## Plan-vs-implementation drift

| Planner expectation | Shipped | Drift? |
|---|---|---|
| 5 seams with concrete citations | Authorable-check + live Postgres probes | None |
| Postgres-enforced human gate | SECURITY DEFINER + partial unique index + trigger | None (not handler-only) |
| Fulcrum alias of evidence-research | Instantiation list + CLI alias | None for template surface; +check CLI is intentional gate-3 proof tooling |
| Real fleet instance IDs | `mintFleetInstanceId` + real cycle artifacts | None |
| Pure-TS gate | No LLM surfaces | None |

---

## Stub / integrity scan (review hygiene)

| Pattern | Result |
|---|---|
| Fake-success tool/step execute in seams under review | N/A (no new Mastra tools in this chore) |
| `z.any()` on reviewed production schemas | Not present on evidence-gate / cycle gate inputs |
| Hardcoded assay/challenge instance tokens in production mint path | Absent; mint uses UUID |
| Placeholder seam citations | Absent |
| Handler-only human-gate enforcement | Rejected — trigger/index are authoritative |

---

## Verification evidence reviewed

| Evidence | Location |
|---|---|
| Live `fulcrum:authorable-check` (exit 0, 5 PASS) | `.tmp/gate-5/authorable-check.txt` |
| Grep pack (SECURITY DEFINER, WIP, fulcrum, fleet, LLM) | `.tmp/gate-5/verification-commands.txt`, `greps.txt`, `deeper-greps.txt`, `tc-verifies.txt` |
| Real fleet cycle artifacts | `.tmp/gate-2/artifacts/gate-4-*-cycle.json` |
| Gate commits | gate-1 `5e9dbb6f`…, gate-2 `7fea20a1`, gate-3 `1579b9aa` |

No Studio screenshot required for this CHORE; CLI + migration + artifact citations are the contract evidence.

---

## Verdict rationale

All four acceptance criteria and four test criteria are **satisfied** with concrete file:line (and migration:line) evidence. Determinism is DB-enforced; fulcrum remains alias-only; instance inequality is proven from real fleet traces; evidence-gate is pure-TS. Non-blocking notes do not undermine seam sufficiency.

**APPROVE** — seams suffice to author fulcrum with zero new template/platform product code.

---

## Quality gate (reviewer self-check)

- [x] Read planner contract `gate-5-review-seam-sufficiency.md`
- [x] Read cited files at referenced lines (not only CLI output)
- [x] Ran `holo fulcrum:authorable-check` against this worktree
- [x] Greped SECURITY DEFINER / WIP unique index / templateKey fulcrum / fleet mint / LLM surfaces
- [x] Findings cite file:line
- [x] No rationalization of missing enforcement
- [x] Explicit verdict: **APPROVE**
