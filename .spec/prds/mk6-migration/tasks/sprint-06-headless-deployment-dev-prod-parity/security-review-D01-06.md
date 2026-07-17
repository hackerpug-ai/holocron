# SECURITY REVIEW — D01-06: Consolidated secrets store

**Status:** Completed
**Task:** D01-06 — Security review: consolidated secrets store  
**Reviewer:** security-reviewer  
**Date:** 2026-07-15  
**Branch reviewed:** `task/D01-06` (D01-04 implementation on main lineage)  
**Scope:** Confidentiality at rest and in process env for consolidated secrets — **config-hygiene only**  
**Out of scope (by design / AP-7):** Multi-tenant isolation, RLS, access-control beyond config-hygiene, scoped-key middleware auth (Sprint 05)

**Evidence:** `.tmp/D01-06/audit-evidence.txt`

---

## AC verdict table (mandatory)

| AC | Check | Verdict | Evidence |
|----|--------|---------|----------|
| AC-1 | secrets gitignored / never committed | **PASS** | `services/platform/config/.gitignore:2-3`; `git check-ignore -v` → ignored; `git ls-files` tracks only `.gitignore` + `secrets.example.yaml`; `git rev-list --all -- secrets.yaml` empty |
| AC-2 | zero hardcoded secrets | **PASS** | No real API keys/tokens/private keys in `services/platform/src/`. Loopback non-credential fallbacks only (see LOW note). Schema placeholders in `secrets.example.yaml` only. |
| AC-3 | secure env loading (no shell eval) | **PASS** | `secrets.ts` uses `readFileSync` + `yaml.parse`; no `eval` / `shell:true` / `execSync` with secret-in-command. Doctor never emits values. |
| AC-4 | config-hygiene scope NOT multi-tenant isolation (AP-7) | **PASS** | Single-source map (env > secrets.yaml). No per-tenant keys/RLS. Trust boundary = tailnet ACLs + scoped keys per AP-7. |
| AC-5 | Finding log with verdict | **PASS** | This document; explicit verdict line below. |

---

## SECURITY REVIEW VERDICT

**STATUS: PASS**

**Verdict: APPROVED**

No CRITICAL findings. Consolidated secrets store is safe for confidentiality at rest (gitignored file + example schema only in repo) and in process env (secure load path, no injection). Config-hygiene correctly implements AP-7 single-user tailnet trust (NOT multi-tenant isolation).

---

## What was checked

### AC-1 — secrets gitignored (never committed)

**What:** Audit that real secrets file is ignored and has never entered git history; only schema/example is committed.

**How:**
1. Read `services/platform/config/.gitignore` — lists `secrets.yaml` and `secrets.yml`.
2. `git check-ignore -v services/platform/config/secrets.yaml` →  
   `services/platform/config/.gitignore:2:secrets.yaml	services/platform/config/secrets.yaml`
3. `git ls-files services/platform/config/` → only:
   - `services/platform/config/.gitignore`
   - `services/platform/config/secrets.example.yaml`
4. `git rev-list --all -- services/platform/config/secrets.yaml` → empty (zero commits)
5. `git ls-files --error-unmatch services/platform/config/secrets.yaml` → not tracked
6. `secrets.example.yaml` contains only placeholders (`replace-me-*`, `sk-none`, loopback hosts) — not production credentials.

**Result:** **secrets gitignored: PASS** · **zero secrets committed: PASS**

Working-tree `secrets.yaml` may exist locally (gitignored); current worktree copy matches the example schema (placeholders only). That is correct operator workflow, not a leak.

---

### AC-2 — zero hardcoded secrets

**What:** Grep `services/platform/src/` for hardcoded production secrets (DATABASE_URL credentials, fleet API keys, scoped keys, auth tokens).

**How:**
- Pattern scan for credential-like literals (`postgres://…`, `sk-…`, JWTs, AWS keys, `*_KEY = '…'`).
- Review consolidated loader and call sites (`getSecretValue`, `loadConsolidatedSecrets`, `process.env` reads).
- Confirm `secrets.example.yaml` is schema-only.

**Result:** **zero hardcoded secrets: PASS**

| Location | Content | Classification |
|----------|---------|----------------|
| `services/platform/src/db/connection.ts:6,9` | `postgres://127.0.0.1:5432/postgres` / `…/holocron` | Local loopback defaults **without credentials** — not secrets |
| `services/platform/src/mastra.ts:5-7` | same loopback `DATABASE_URL`; `FLEET_URL` loopback; `FLEET_KEY ?? 'sk-none'` | Documented local fallbacks matching example schema — not production secrets |
| `services/platform/config/secrets.example.yaml` | `replace-me-*`, `sk-none`, `127.0.0.1` | Committed schema only |

No `HOLO_KEY_*`, `MASTRA_API_KEY`, or `TAILSCALE_AUTH_KEY` production values in source. Config resolution path is env → `secrets.yaml` via `services/platform/src/config/secrets.ts`.

---

### AC-3 — secure env loading (no shell eval)

**What:** Confirm loader cannot be used for shell injection; secrets enter process memory via safe APIs.

**How — code audit of primary loader:**

```83:96:services/platform/src/config/secrets.ts
export function loadSecretsFile(path: string): SecretsMap {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  // ... flat map coerceString only — no eval, no shell
}
```

- Load path: `fs.readFileSync` + `yaml` package parse → string map → optional `process.env` overlay in memory (`loadConsolidatedSecrets`).
- Resolution: `env` wins over file (`resolveSecret` / `getSecretValue`).
- **No** `eval`, **no** `new Function`, **no** `shell: true`, **no** `execSync`/`spawn` that interpolates secret values into a shell command.
- CLI: `holo secrets doctor` / `secrets:doctor` / `verify-no-convex-env` in `services/platform/src/cli/holo.ts` (~803–847) call TypeScript modules directly; doctor formats presence only (`SecretResolution` has `present`/`source`, never `value`).
- `verify-no-convex-env.ts` uses `spawnSync('rg', args, { cwd, encoding })` with **argv array** (not shell) and **fixed pattern tokens** — not secret-driven.

**YAML safety:** `yaml` 2.x does not execute `!!js/function` tags (unresolved tag warning; value treated as non-executable). Loader further coerces values to strings only.

**Doctor leakage:** Live run confirms text output has no secret material (`text_leaks_values: false`; resolutions lack `value` field).

**Result:** **secure env loading: PASS**

---

### AC-4 — config-hygiene scope NOT multi-tenant isolation (AP-7)

**What:** Confirm this design is single-source config hygiene under AP-7 single-user tailnet trust — not tenant isolation.

**How:**
- Architecture posture AP-7: personal single-user app; **No RLS and no multi-tenant isolation**; trust boundary = Tailscale ACLs + scoped API keys.
- Secrets model: one flat key→string map for the host; same keys across mini/laptop, different values; order `process.env > secrets.yaml`.
- No per-tenant secret namespaces, no RLS policies in the secrets store, no multi-tenant key derivation.
- `postgresConnectionFacts.authModel: 'single-user-tailnet-trust'` aligns with AP-7.
- Scoped keys (`HOLO_KEY_RN` / `MCP` / `CONTROL`) are **config values** for the single trust boundary — not multi-tenant isolation (scoped-key middleware is separate Sprint 05 surface).

**Result:** **config-hygiene scope: PASS** · **NOT multi-tenant isolation (AP-7): confirmed**

This review does **not** demand multi-tenant RLS or per-tenant secret isolation — that would violate AP-7.

---

## What was found

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._

### LOW / informational (do not block APPROVED)

1. **Local loopback fallbacks in code** (`connection.ts`, `mastra.ts`): credential-less postgres URLs and `sk-none` fleet sentinel when env/file unset. Acceptable under AP-7 loopback/dev posture; production operators should rely on env or `secrets.yaml` (`holo secrets doctor` fail-closed for required keys). Not a hardcoded production secret.
2. **File mode on local `secrets.yaml`:** worktree file is `0644`. On a single-user Mac under AP-7 this is acceptable; optional hardening is `chmod 600` for defense-in-depth on multi-user hosts (out of D01-04 scope).
3. **MCP sidecar loader** (`holocron-mcp/src/config/env.ts`): line-based `:` split of secrets.yaml into `process.env` — also no eval; noted for completeness, not primary D01-04 surface.

---

## Artifacts reviewed (read-only)

| Path | Role |
|------|------|
| `services/platform/config/.gitignore` | Ignores real secrets file |
| `services/platform/config/secrets.example.yaml` | Committed schema / placeholders |
| `services/platform/config/secrets.yaml` | Local only (gitignored); not in history |
| `services/platform/src/config/secrets.ts` | Consolidated loader + doctor |
| `services/platform/src/config/verify-no-convex-env.ts` | Build gate (argv `rg`, no shell) |
| `services/platform/src/config/index.ts` | Public exports |
| `services/platform/src/cli/holo.ts` | `secrets doctor`, `verify-no-convex-env` |
| `.spec/.../01-architecture-posture.md` AP-7 | Trust boundary definition |

**Prohibited:** No modifications to `services/platform/**` production code in this review.

---

## Gate summary

| Gate | Status |
|------|--------|
| secrets gitignored | PASS |
| zero secrets committed | PASS |
| zero hardcoded secrets | PASS |
| secure env loading | PASS |
| config-hygiene scope (AP-7) | PASS |
| Finding log exists with verdict | PASS |

**Verdict: APPROVED**
