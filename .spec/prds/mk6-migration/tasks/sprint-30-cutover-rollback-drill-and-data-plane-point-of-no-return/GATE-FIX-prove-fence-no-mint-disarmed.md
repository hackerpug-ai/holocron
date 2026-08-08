# GATE-FIX-prove-fence-no-mint-disarmed — Live fence prove must not mint documents when fence is disarmed (H-1)

> **Task ID:** GATE-FIX-prove-fence-no-mint-disarmed
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** Independent review H-1 — live fence prove mints production writes when disarmed
> **Source:** `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` (reviewed HEAD `3ba6ab5c`, verdict **NEEDS_REVISION**)
> **RED reproduction (this host, durable fence `"0"`):**
> - `bash scripts/prove-sprint30-fence-armed-live.sh --base-url http://127.0.0.1:44121`
> - → exit **2** (`FENCE_NOT_ARMED_ON_SERVING_PROCESS`) **and** HTTP **201** with a real minted document body
> - Poisons zero-loss ledger (`post_export_write_audit` / documents) the prove step is supposed to help protect
> **Proposed by:** `devops-engineer` (orchestrator plan from independent red-hat review)
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> **Status:** Plan only — not implemented
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)
> **Siblings:** `GATE-FIX-gate-preflight-fence-rearm` (parent live 423 oracle land) · `GATE-FIX-post-ponr-gate-meta-parse` (C-1) · `GATE-FIX-drill-fence-precondition` · `GATE-FIX-zero-loss-t-sync-013`

## Finding

**H-1 — Live fence prove mints production writes when disarmed.** Severity: **HIGH**. Confidence: **HIGH** (independently reproduced this review cycle).

### What works (preserve)

- Prove script correctly treats non-423 as **fail** (`ok:false`, exit 2, `FENCE_NOT_ARMED_ON_SERVING_PROCESS`) — fail path is real, not source-text theatre.
- Green path (HTTP **423** + `migration_read_only` body) is the correct armed-fence oracle and must remain the only PASS.
- Parent task `GATE-FIX-gate-preflight-fence-rearm` wires default-ON rearm **before** prove; when rearm succeeds, POST is expected to 423 and not mint.
- Product soak fence middleware still returns 423 when durable fence is armed and serving process re-reads it.
- CLI-only `isMigrationReadOnly()===true` without live 423 remains **NOT** closed (parent AC-2).

### What remains broken

`scripts/prove-sprint30-fence-armed-live.sh` always issues:

```bash
curl -X POST "$BASE_URL/api/documents" ... -d '{"title":"fence-prove-…", ...}'
```

**before** knowing whether the fence is armed. When durable/serving fence is **disarmed**:

| Observation | Value |
|-------------|-------|
| Durable fence | `HOLO_MIGRATION_READ_ONLY: "0"` |
| Prove exit | `2` |
| Write probe | HTTP **201** + minted document body |

That is a correct **oracle fail** for “fence is not armed on serving process,” but a **safety defect**: the probe itself recreates the T-SYNC-013 poison class (accepted production write / ledger row) that preflight rearm + zero-loss oracles exist to prevent.

**Poison scenarios (still reachable after parent land):**

1. Rearm fails open / is skipped (`HOLO_GATE_REARM_FENCE=0`)
2. Durable write does not affect serving process (deploy lag / sticky env / wrong secrets path)
3. Operator runs prove script standalone against a disarmed soak server
4. Preflight order regression later reintroduces prove-before-rearm

### Required remediation

**Prefer fail-closed before write** (primary):

1. Read durable + CLI-effective fence via existing `isMigrationReadOnly()` / `readDurableMigrationReadOnly()` / equivalent durable secrets shape **before** any `POST /api/documents`.
2. If fence reads **disarmed** → exit non-zero with explicit code (e.g. `FENCE_DISARMED_PRECHECK` / keep or nest under `FENCE_NOT_ARMED_ON_SERVING_PROCESS`) **without** issuing the mutating POST.
3. Only when durable/CLI fence reads **armed** may the live POST run (to prove serving process is not stuck disarmed — the 423 oracle).

**Acceptable secondary (defense-in-depth, not a substitute for precheck alone if POST still runs under known-disarmed):**

- If a 201 is ever observed, immediately trigger ledger dual-reset (`scripts/reset-sprint30-gate-ledger.sh --authorize` or documented dual-reset) and fail closed with evidence of the mint + clear.
- Prefer unique probe titles already used; still must not leave accepted ledger rows after prove failure.

**Required test (non-waivable):** prove script must **not** perform the write when the fence reads disarmed, verified against a **real** (not mocked) disarmed serving process, with a **ledger-count assertion before/after** (Postgres `post_export_write_audit` and/or documents count for the probe title — count must not increase because of the prove invocation).

## Scope (WRITE-ALLOWED)

- `scripts/prove-sprint30-fence-armed-live.sh` — precheck before POST; optional post-201 dual-reset; always write `--out` evidence before nonzero exit (L-1 hardening welcome if cheap)
- Optional small helper under `scripts/lib/` for durable/CLI fence read used by the prove script (prefer existing soak-fence / rearm plumbing — no second fence mechanism)
- `scripts/run-sprint30-human-gate.sh` — only if preflight must pass through new prove exit codes / evidence paths; preserve default rearm-then-prove order
- `scripts/reset-sprint30-gate-ledger.sh` — only if auto dual-reset on accidental 201 is chosen
- `tests/cutover/gate-fix-prove-fence-no-mint-disarmed.test.ts` (and/or extend `tests/cutover/gate-fix-gate-preflight-fence-rearm.test.ts`)
- Evidence: `.tmp/GATE-FIX-prove-fence-no-mint-disarmed/**`
- Cross-link `GATE-FIX-gate-preflight-fence-rearm.md`, `GATE-FIX-zero-loss-t-sync-013.md`, `GATE-FIX-drill-fence-precondition.md`, `GATE-FIX-post-ponr-gate-meta-parse.md`
- **Does not** weaken live 423 PASS requirement when fence is armed
- **Does not** invent a second fence key beyond `HOLO_MIGRATION_READ_ONLY`
- **Does not** regex-rewrite secrets.yaml
- **Does not** treat CLI-only armed as PASS without live 423 when POST is allowed
- **Does not** re-open product five-surface drill precondition (sibling)

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY — no write when disarmed)** GIVEN durable and/or CLI-effective soak fence reads **disarmed** (`HOLO_MIGRATION_READ_ONLY` not armed / `isMigrationReadOnly()===false`) WHEN `scripts/prove-sprint30-fence-armed-live.sh` runs against a **real** serving process THEN it MUST:
  1. Fail closed (nonzero exit; explicit error code in JSON evidence), **and**
  2. **NOT** issue `POST /api/documents` (or any other ledger-minting write), **and**
  3. Leave Postgres `post_export_write_audit` accepted_count (and probe-title document count) **unchanged** vs a measured before-count.
  Mocked curl / stubbed HTTP is **NOT** closed for this AC.

- [ ] **AC-2 (armed path still requires live 423)** GIVEN durable fence armed (`'1'`) and serving process re-reads it WHEN prove runs THEN PASS still requires real HTTP **423** + `migration_read_only` body. CLI-only armed without live 423 is still **NOT** closed. No mint on 423 path.

- [ ] **AC-3 (optional / defense-in-depth 201 recovery)** GIVEN any path that still observes HTTP 201 from the prove probe (should be unreachable after AC-1 if precheck is sole write gate; required if implementer keeps a write-first path under unknown state) WHEN 201 is seen THEN prove MUST fail closed **and** immediately dual-reset the zero-loss ledger (or document+execute equivalent clear) so the mint does not remain as T-SYNC-013 poison. Evidence must record pre/post ledger counts.

- [ ] **AC-4 (evidence always written)** GIVEN prove fails (disarmed precheck or non-423) WHEN `--out path` is provided THEN evidence JSON is written **before** nonzero exit (addresses review L-1). Include: fence precheck result, whether POST was attempted, HTTP status if any, ledger before/after counts when measured.

- [ ] **AC-5 (preflight composition preserved)** GIVEN human-gate default preflight (rearm ON then prove) WHEN rearm succeeds and serving is armed THEN prove still greens on live 423. GIVEN rearm skipped/fails and fence remains disarmed WHEN prove runs THEN AC-1 applies (no mint). Do not require rearm success to avoid mint — prove must be safe standalone.

- [ ] **AC-6 (RED first + branch discipline)** Capture RED from independent live run against durable `"0"` (exit 2 + HTTP 201 mint). GREEN evidence under `.tmp/GATE-FIX-prove-fence-no-mint-disarmed/` with real disarmed server + ledger before/after. Implementer branch; merge only after dual-lens APPROVED (orchestrator-only).

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | RED: disarmed durable + live prove exits 2 and (pre-fix) minted HTTP 201 | AC-6 | `red-disarmed-prove-minted-201.json` |
| TC-2 | GREEN: disarmed durable + live prove exits nonzero **without** POST; ledger count delta=0 | AC-1 | `ac1-disarmed-no-mint-ledger.json` |
| TC-3 | Static/source: precheck / fence read appears **before** curl POST in prove script | AC-1 | `ac1-static-call-order.md` |
| TC-4 | Armed fence: live POST returns 423 + migration_read_only; ok:true; no mint | AC-2 | `ac2-armed-live-423.json` |
| TC-5 | CLI-only armed without live 423 is still fail (if POST runs and gets non-423) | AC-2 | `ac2-cli-only-not-closed.*` |
| TC-6 | Ledger before/after assertion on real disarmed serving process (not mocked) | AC-1 | `ac1-disarmed-no-mint-ledger.json` |
| TC-7 | Optional: simulated/forced 201 path triggers dual-reset + fail | AC-3 | `ac3-201-dual-reset.*` |
| TC-8 | `--out` evidence file exists on fail paths | AC-4 | `ac4-out-on-fail.json` |
| TC-9 | Standalone prove (no rearm) against disarmed server still does not mint | AC-5 | `ac5-standalone-disarmed-safe.*` |
| TC-10 | Unit/integration suite registers TC-2/TC-6; no curl mock substituting for real server on AC-1 | AC-1, AC-6 | `tests/cutover/gate-fix-prove-fence-no-mint-disarmed.test.ts` |

## Anti-stub (fakeability floor)

- **NOT closed:** fail after HTTP 201 with exit 2 while leaving the minted document / ledger row in place (current residual).
- **NOT closed:** mocking fetch/curl to pretend POST was skipped without a real disarmed server + ledger delta=0.
- **NOT closed:** CLI `isMigrationReadOnly()===true` alone as PASS (live 423 still required when write probe is allowed).
- **NOT closed:** “rearm usually runs first” as the only protection — prove must be safe when rearm is skipped.
- **NOT closed:** path-exists on prove script without ledger before/after on disarmed path.
- **NOT closed:** inventing a second fence env/key.
- **NOT closed:** sed/regex rewrite of secrets.yaml for fence state.
- **NOT closed:** counting “probe attempted” without measuring ledger/document identity delta.

## Critical Constraints

- **MUST** check durable/CLI `isMigrationReadOnly()` (or equivalent durable fence read) **before** issuing POST when that read says disarmed
- **MUST** leave ledger accepted_count unchanged on the disarmed prove path (real server, real count)
- **MUST** keep live HTTP 423 + `migration_read_only` as the only PASS when the write probe is performed
- **MUST** red_first from independent disarmed 201 mint reproduction
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **MUST** write `--out` evidence before nonzero exit when `--out` provided
- **NEVER** mint a production document as a side effect of a failed prove under known-disarmed fence
- **NEVER** treat CLI-only fence as PASS without live 423 on the armed path
- **NEVER** invent a second fence mechanism or regex-rewrite secrets
- **STRICTLY** this task = prove script / gate preflight oracle safety; not product drill five-surface redesign
- **STRICTLY** fakeability floor: real disarmed serving process + ledger count before/after + static precheck-before-POST order

## Evidence

`.tmp/GATE-FIX-prove-fence-no-mint-disarmed/`

| Artifact | Proves |
|----------|--------|
| `red-disarmed-prove-minted-201.json` | AC-6 RED: exit 2 + HTTP 201 mint under durable `"0"` |
| `ac1-disarmed-no-mint-ledger.json` | AC-1 GREEN: no POST / ledger delta=0 |
| `ac1-static-call-order.md` | TC-3 precheck before curl POST |
| `ac2-armed-live-423.json` | AC-2 armed PASS path |
| `ac3-201-dual-reset.*` | AC-3 if implemented |
| `ac4-out-on-fail.json` | AC-4 |
| `ac5-standalone-disarmed-safe.*` | AC-5 |
| `ac6-disposition.md` | Disposition vs H-1 |

Seed / cite (read-only) RED evidence:

- Independent review live table: durable `"0"`, prove exit 2, HTTP 201
- `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` (H-1)
- Parent rearm wiring: `scripts/run-sprint30-human-gate.sh` prove invocation
- Reviewed HEAD: `3ba6ab5c4189a3091e804b345342e9502604724f`

## Reading List

- Independent review: `.spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` — H-1 + claim 2
- `scripts/prove-sprint30-fence-armed-live.sh` — current always-POST probe
- `scripts/run-sprint30-human-gate.sh` — rearm then prove preflight
- `scripts/rearm-sprint30-cutover-control-plane.sh` + `scripts/lib/rearm-sprint30-cutover-control-plane.ts`
- `scripts/reset-sprint30-gate-ledger.sh` — dual-reset for optional 201 recovery
- `services/platform/src/cutover/soak-fence.ts` — `isMigrationReadOnly` / durable read/write
- `GATE-FIX-gate-preflight-fence-rearm.md` — parent (preserve live 423; this task hardens fail path)
- `GATE-FIX-zero-loss-t-sync-013.md` — zero-loss ledger identity (prove must not poison)
- `GATE-FIX-drill-fence-precondition.md` — product fail-closed before five-surface probes (sibling pattern)

## Design

### Pattern (chosen) — precheck before POST

```text
1) Resolve BASE_URL + RN key (existing)
2) GET /health (existing; base alive)
3) Fence precheck:
     durable HOLO_MIGRATION_READ_ONLY shape and/or CLI isMigrationReadOnly()
     if DISARMED:
       write evidence JSON (ok:false, post_attempted:false, ledger_before=ledger_after)
       exit 2  — NEVER curl POST /api/documents
4) If ARMED:
     POST /api/documents → require 423 + migration_read_only
     if 201: fail + optional immediate dual-reset + ledger evidence
5) Always write --out before exit when requested
```

### Optional dual-reset on 201

If implementer keeps any path that can still POST under uncertain state:

```text
on status==201:
  record minted id from body
  bash scripts/reset-sprint30-gate-ledger.sh --authorize ...
  evidence: mint_id, ledger_before, ledger_after
  exit 2
```

AC-1 precheck remains mandatory; dual-reset is belt-and-suspenders.

### Anti-pattern

- Relying solely on preflight rearm order.
- “Exit 2 is enough” while leaving 201 rows in the ledger.
- Mocked HTTP for the disarmed no-mint claim.

## Disposition

**HIGH** residual on gate live fence oracle: `prove-sprint30-fence-armed-live.sh` correctly fails when the serving process is disarmed, but the fail path itself mints a real document and poisons the zero-loss ledger. Preflight rearm mitigates the common path; it does not make the prove script safe under rearm skip/failure/deploy lag.

Close by fail-closed durable/CLI fence precheck **before** POST (no mint, ledger delta=0 on real disarmed server), preserve live 423 as sole armed PASS, optional 201 dual-reset, and always-write `--out` evidence. Sprint 30 remains **In Progress**.

AGENT: implementer=devops-engineer | proposed_by=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T02:30:00Z
finding_ids: [H-1, GATE-FIX-prove-fence-no-mint-disarmed, FENCE_NOT_ARMED_ON_SERVING_PROCESS, 3ba6ab5c]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-prove-fence-no-mint-disarmed",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "agent": "devops-engineer",
  "technical_reviewer": "code-reviewer",
  "standing_test_reality": "test-quality-reviewer",
  "severity": "HIGH",
  "touches_capabilities": ["CAP-CUT-01"],
  "prd_refs": ["UC-SYNC-04", "T-SYNC-013"],
  "siblings": [
    "GATE-FIX-gate-preflight-fence-rearm",
    "GATE-FIX-post-ponr-gate-meta-parse",
    "GATE-FIX-zero-loss-t-sync-013",
    "GATE-FIX-drill-fence-precondition"
  ],
  "red_evidence_git_sha": "3ba6ab5c4189a3091e804b345342e9502604724f",
  "source_review": ".spec/reviews/red-hat-sprint-30-20260808T014319Z-gate-fix-review.md",
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "do_not_reopen": ["C-2-packaging", "C-3-trigger-set", "second-fence-mechanism", "regex-secrets-rewrite"],
  "fakeability_floor_rejected": [
    "fail_after_201_leaving_minted_row",
    "mocked_curl_without_real_disarmed_server",
    "cli_only_fence_as_pass",
    "rearm_order_only_protection",
    "path_exists_only",
    "no_ledger_before_after"
  ],
  "fixtures": {
    "live_disarmed_prove_mint_red": {
      "description": "Real durable HOLO_MIGRATION_READ_ONLY=0; prove exit 2 + HTTP 201 mint (pre-fix RED)",
      "seed_method": "cli_real_serving_process"
    },
    "live_disarmed_prove_no_mint_green": {
      "description": "After fix: real disarmed server; prove fails closed without POST; ledger count delta 0",
      "seed_method": "cli_real_serving_process_real_postgres"
    },
    "live_armed_423_pass": {
      "description": "Armed durable+serving: POST returns 423 migration_read_only; ok true",
      "seed_method": "cli_real_serving_process"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Disarmed fence: fail closed without POST; ledger count unchanged on real server", "verify": "ac1-disarmed-no-mint-ledger.json"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Armed path still requires live 423 migration_read_only; no CLI-only pass", "verify": "ac2-armed-live-423.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Optional 201 path dual-resets ledger and fails closed", "verify": "ac3-201-dual-reset"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "--out evidence written before nonzero exit", "verify": "ac4-out-on-fail.json"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Standalone prove safe when rearm skipped; preflight composition preserved", "verify": "ac5-standalone-disarmed-safe"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED first on disarmed 201 mint; branch discipline", "verify": "red-disarmed-prove-minted-201.json"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED disarmed 201 mint", "verify": "red-disarmed-prove-minted-201.json"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "GREEN no mint ledger delta 0", "verify": "ac1-disarmed-no-mint-ledger.json"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static precheck before POST", "verify": "ac1-static-call-order.md"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Armed live 423", "verify": "ac2-armed-live-423.json"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "CLI-only not closed", "verify": "ac2-cli-only-not-closed"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Real ledger before/after", "verify": "ac1-disarmed-no-mint-ledger.json"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "201 dual-reset optional", "verify": "ac3-201-dual-reset"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "out on fail", "verify": "ac4-out-on-fail.json"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "Standalone disarmed safe", "verify": "ac5-standalone-disarmed-safe"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Suite registers real-server no-mint claim", "verify": "tests/cutover/gate-fix-prove-fence-no-mint-disarmed.test.ts"}
  ]
}
-->
