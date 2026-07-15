# RED-HAT CLOSEOUT — Sprint 6 (Headless Deployment and Dev/Prod Parity)

**Role:** adversarial security/ops reviewer (read-only on product source)  
**Date:** 2026-07-15  
**Branch / HEAD:** `main` at review time  
**Sprint dir:** `.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/`  
**Scope:** D01-01…D01-06 landed stack supervisor, launchd, secrets, embed health, security review

---

## Verdict table (first)

| ID | Area | Verdict | Confidence | Evidence |
|----|------|---------|------------|----------|
| RH-1 | Consolidated secrets → managed Mastra runtime | **FAIL (blocking)** | HIGH | Live launchd env lacks `HOLO_KEY_*`; Bearer from secrets.yaml → 401 unknown key |
| RH-A1 | Human gate text vs honest scheduler/zero-cache | ADVISORY | MEDIUM | SPRINT Human Gate says four services healthy; status reports pending/disabled by design |
| RH-A2 | `FLEET_URL` hardcoded in mastra plist | ADVISORY | MEDIUM | `holocron-mastra.plist` hardcodes loopback; not `@FLEET_URL@` / secrets |
| RH-A3 | `install-launchd.sh` echoes `DATABASE_URL` | ADVISORY | MEDIUM | `scripts/install-launchd.sh:109` |
| RH-A4 | Secrets doctor accepts placeholder values | ADVISORY | MEDIUM | `replace-me-*` / `sk-none` count as resolved |
| RH-A5 | zero_cache healthy = launchd PID only | ADVISORY | LOW | `probeZeroCacheState` no HTTP contract (OK while disabled) |
| RH-A6 | Convex aliases outside gated roots | ADVISORY | LOW | Residual in `cli/`, `docs/`, `scripts/` — outside T-PLAT-017 roots |
| — | Fake-healthy postgres/mastra/embed/scheduler | **PASS** | HIGH | Real probes; scheduler never healthy; zero_cache disabled |
| — | stack down orphan posture (design) | **PASS** | HIGH | bootout + residual kill + `pg_isready` fail required |
| — | Embed probe from Fleet Role Manifest | **PASS** | HIGH | `resolveEmbedHealthProbe` reads manifest; live GET `/v1/models` 200 |
| — | verify-no-convex-env + CI gate | **PASS** | HIGH | CLI exit 0; `.github/workflows/verify-no-convex-env.yml` |
| — | secrets.yaml gitignored | **PASS** | HIGH | `git check-ignore` via config `.gitignore` |

**Overall closeout verdict: FINDINGS** (1 HIGH blocking)

---

## Live probe evidence (this host)

```text
$ bun services/platform/src/cli/holo.ts stack status
  postgres:    healthy
  mastra:      healthy
  scheduler:   pending
  zero_cache:  disabled
  embed:       healthy
  mode:        launchd
  status: OK

$ bun services/platform/src/cli/holo.ts secrets doctor
  … all 10 required keys: resolved → status: OK (exit 0)

$ bun services/platform/src/cli/holo.ts verify-no-convex-env
  zero Convex env aliases found (clean) → status: OK (exit 0)

$ launchctl print gui/$(id -u)/holocron-mastra  # environment excerpt
  DATABASE_URL => postgres://127.0.0.1:5432/holocron
  FLEET_URL => http://127.0.0.1:4545/v1
  PORT => 4111
  # NO HOLO_KEY_RN / HOLO_KEY_MCP / HOLO_KEY_CONTROL / MASTRA_API_KEY / FLEET_KEY

$ curl -H 'Authorization: Bearer replace-me-rn-key' http://127.0.0.1:4111/api/missions
  {"error":"unauthorized","message":"unknown API key"}  HTTP 401
  # secrets.yaml has HOLO_KEY_RN: replace-me-rn-key and doctor reports resolved
```

Probes used: real `pg_isready`, curl Mastra `/health`, curl fleet `/v1/models`, launchctl, secrets doctor, verify-no-convex-env.

---

## Blocking findings

### RH-1 — Consolidated secrets not applied to launchd-managed Mastra (HIGH)

**Title:** `holo secrets doctor` / `secrets.yaml` success does not load into headless stack process env  

**Detail:**  
D01-04 establishes a consolidated secrets source (`env > secrets.yaml`) and required keys including `HOLO_KEY_RN`, `HOLO_KEY_MCP`, `HOLO_KEY_CONTROL`, `MASTRA_API_KEY`, `FLEET_KEY`. D01-03/D01-02 run Mastra under launchd with a **clean environment** (explicit D01-02 constraint: do not assume shell profile; set `EnvironmentVariables` in the plist).

What actually ships:

1. **Plist injects only** `DATABASE_URL`, `PORT`, `FLEET_URL` (hardcoded loopback), `HOLO_ROOT`, `PATH`, `HOME`  
   — see `services/platform/deploy/launchd/holocron-mastra.plist` and live `launchctl print`.
2. **`service:up` / `mastra.ts` / scoped-key middleware** read **only** `process.env` — never call `getSecretValue` / `loadConsolidatedSecrets`  
   — `services/platform/src/mastra.ts`, `services/platform/src/http/middleware/scoped-key.ts`, `services/platform/src/cli/holo.ts` `service:up`.
3. **Stack materializer** (`launchd.ts` / `install-launchd.sh`) substitutes `@DATABASE_URL@` only — does not propagate required auth keys from the consolidated map.
4. **Live proof:** doctor reports `HOLO_KEY_RN: resolved` from secrets.yaml; same value as Bearer is **rejected** as unknown API key on the running stack.

Auth is fail-closed (empty configured keys → 401), so this is **not** an open-access hole. It **is** a high-confidence **ops/config-contract break**: the headless stack does not actually run on the consolidated secrets store for the keys the doctor claims are required. Operators (and mini/laptop parity) will believe config is ready when protected routes cannot be authenticated with documented secret values.

Also weakens D01-04 “STRICTLY all config resolves from consolidated secrets” for the primary managed process.

**Remediation (preferred order):**

1. **Load consolidated secrets at process boot** in `service:up` / `startService` (before Hono middleware captures keys): overlay missing `process.env` from `loadConsolidatedSecrets()` so launchd clean env still picks up gitignored `secrets.yaml` without writing secrets into world-readable plists.
2. Optionally inject non-secret/port keys via plist; keep credentials out of `~/Library/LaunchAgents/*.plist` (currently 0644).
3. Add a RED integration assertion: after `holo stack up`, a Bearer using the doctor-resolved `HOLO_KEY_RN` source must get non-401 on a protected path (or middleware must see non-empty configured keys).
4. Extend `holo secrets doctor` (or `stack status`) with a **runtime env audit** optional check so “resolved in file” ≠ “present in running mastra” cannot silently diverge.

**Agents agree:** 1 (this red-hat pass; prior D01-06 reviewed confidentiality of the store, not runtime injection into launchd).

---

## Advisory findings

### RH-A1 — Human gate wording vs honest four-slot contract (MEDIUM)

SPRINT Human Testing Gate / overview still say all four services (including scheduler + zero-cache) report **healthy** within 60s. Task ACs and implementation correctly keep **scheduler: pending** (Sprint 11) and **zero_cache: disabled** (Sprint 20), and `stack up` only gates on postgres+mastra. Gate evidence files already passed under the honest interpretation. **Remediation:** rewrite Human Gate / deliverable text to match “postgres+mastra healthy; scheduler pending; zero_cache disabled|healthy-if-launched”.

### RH-A2 — `FLEET_URL` hardcoded in mastra launchd template (MEDIUM)

`holocron-mastra.plist` sets `FLEET_URL` to `http://127.0.0.1:4545/v1` rather than a substituted secret/`@FLEET_URL@`. Stack `loadStackConfig()` reads secrets for fleet URL, but launchd Mastra does not get that value. Fine while both sides are loopback; breaks if secrets/env point fleet elsewhere. **Remediation:** substitute from consolidated secrets at install time **or** load secrets at `service:up` (same as RH-1).

### RH-A3 — install script logs `DATABASE_URL` (MEDIUM)

`scripts/install-launchd.sh` prints `DATABASE_URL=$DATABASE_URL` to stdout. If operators use password-bearing URLs, install logs leak credentials. **Remediation:** log host/db only, or “DATABASE_URL: set”.

### RH-A4 — Doctor treats placeholders as resolved (MEDIUM)

Local `secrets.yaml` matches `secrets.example.yaml` (`replace-me-*`, `sk-none`). Doctor exits 0. Acceptable for schema presence; weak as a “prod readiness” signal. **Remediation:** optional `--strict` rejecting known sentinel prefixes.

### RH-A5 — zero_cache “healthy” = PID only (LOW)

`probeZeroCacheState` marks healthy solely on launchd PID. Safe while unit is Disabled; weak if a placeholder binary is KeepAlive’d later. Sprint 20 should add a real health contract (never PID-only).

### RH-A6 — Convex aliases outside T-PLAT-017 roots (LOW)

`cli/`, `docs/`, `scripts/` still mention Convex env names. Gate correctly scans `app/`, `holocron-mcp/`, `services/platform/` only. Residual cleanup is backlog hygiene, not a green-gate falsehood.

---

## What is clean (anti-stub / security posture)

| Check | Result |
|-------|--------|
| Postgres probe | Real `pg_isready` against configured host/port (`probes.ts`) |
| Mastra probe | Real `curl` `/health` with body; stack up fails closed on 60s timeout |
| Embed probe (CAP-EMB-01) | Real HTTP; path/method/timeout/expectStatus from Fleet Role Manifest; live 200 on `/v1/models` |
| Scheduler | Always `pending` — never fake-healthy (`probeSchedulerState`) |
| Zero-cache | `Disabled=true` in plist; status `disabled` — never fake-healthy |
| stack down | bootout all labels + residual SIGTERM/SIGKILL + requires `pg_isready` fail and no holocron PIDs |
| Secrets at rest | `secrets.yaml` gitignored; doctor never prints values |
| verify-no-convex-env | Real `rg` over required roots; CI workflow present |
| D01-06 prior review | Confidentiality APPROVED (this closeout does not reopen that bill of health for gitignore/loader safety) |

No CRITICAL fake-healthy stubs found in the supervisor probes for postgres/mastra/embed/scheduler/zero_cache.

---

## AC contract skim (sprint tasks)

| Task | AC posture vs code | Notes |
|------|-------------------|-------|
| D01-01 | RED suite present under `cli/__tests__` | Not re-run full PLATFORM_IT in this pass (optional); live CLI probes used instead |
| D01-02 | Four plists; scheduler/zerocache Disabled | PASS |
| D01-03 | up/down/status real probes; pending/disabled honest | PASS for lifecycle; config contract incomplete for secrets keys (RH-1) |
| D01-04 | doctor + verify + gitignore | PASS on tools; **runtime consumption gap RH-1** |
| D01-05 | embed in status JSON + human | PASS live |
| D01-06 | security-review-D01-06.md APPROVED | PASS on stated scope; did not assert launchd key injection |

---

## Recommendation

Do **not** treat Sprint 6 as fully closed for ops readiness until **RH-1** is fixed: headless `holo stack up` must yield a Mastra process that actually consumes consolidated secrets (at minimum scoped keys + fleet key), with a regression test that fails if doctor-resolved keys are invisible to the running service.

Advisory items can ship as follow-ups; they do not block the same way.

---

## Output JSON (machine)

```json
{
  "verdict": "FINDINGS",
  "blocking_findings": [
    {
      "id": "RH-1",
      "confidence": "HIGH",
      "agents_agree": 1,
      "title": "Consolidated secrets not applied to launchd-managed Mastra runtime",
      "detail": "secrets doctor reports HOLO_KEY_* resolved from secrets.yaml, but holocron-mastra launchd env only has DATABASE_URL/PORT/FLEET_URL/HOLO_ROOT; service:up never loadConsolidatedSecrets; Bearer from secrets.yaml returns 401 unknown API key. Fail-closed auth avoids open access, but breaks consolidated-secrets / headless config contract for the managed stack.",
      "remediation": "Load consolidated secrets into process.env at service:up/startService before middleware init (prefer over writing keys into 0644 LaunchAgent plists); add integration test that stack-up Mastra accepts doctor-resolved HOLO_KEY_RN."
    }
  ],
  "advisory_findings": [
    {
      "id": "RH-A1",
      "confidence": "MEDIUM",
      "title": "Human gate text claims four services healthy; status is pending/disabled by design",
      "remediation": "Align SPRINT Human Gate wording with honest scheduler pending + zero_cache disabled contract."
    },
    {
      "id": "RH-A2",
      "confidence": "MEDIUM",
      "title": "FLEET_URL hardcoded in holocron-mastra.plist",
      "remediation": "Substitute from secrets or load secrets at service:up (same path as RH-1)."
    },
    {
      "id": "RH-A3",
      "confidence": "MEDIUM",
      "title": "install-launchd.sh echoes DATABASE_URL",
      "remediation": "Log presence/host only; never print full connection string."
    },
    {
      "id": "RH-A4",
      "confidence": "MEDIUM",
      "title": "secrets doctor accepts replace-me placeholders as resolved",
      "remediation": "Optional --strict sentinel rejection for prod readiness."
    },
    {
      "id": "RH-A5",
      "confidence": "LOW",
      "title": "zero_cache healthy is PID-only when enabled later",
      "remediation": "Sprint 20: real health probe, never PID-only."
    },
    {
      "id": "RH-A6",
      "confidence": "LOW",
      "title": "Convex env names remain outside T-PLAT-017 scan roots",
      "remediation": "Backlog cleanup of cli/docs/scripts or expand gate if those surfaces stay supported."
    }
  ],
  "summary": "Sprint 6 stack lifecycle probes are real (no fake-healthy postgres/mastra/embed/scheduler/zero_cache). One HIGH ops finding: consolidated secrets are not loaded into the launchd Mastra process, so doctor-green keys do not authenticate against the managed stack."
}
```
