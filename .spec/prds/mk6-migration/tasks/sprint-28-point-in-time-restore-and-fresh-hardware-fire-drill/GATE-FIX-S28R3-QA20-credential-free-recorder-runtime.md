# GATE-FIX-S28R3-QA20 — Credential-free recorder runtime

> Status: ✅ Completed (resolution-only supersession of forbidden 31fee195; no product-source SHA; not a landable task commit)
> Sprint: [Sprint 28](./SPRINT.md)
> Agent: devops-engineer / security / test-quality
> Reviewer: code-reviewer + security-reviewer + test-quality-reviewer
> Priority: P0
> Source SHA: `bd879c1eb746017992ed9e51a83f4a160cc3413f` (main tip after QA19)

## Human-selected resolution (binding)

**Production solution = existing GATE-FIX-S28R3-QA19 trusted-runtime path.**

After QA19, the human installed a **signed, root-owned** Bun at `/usr/local/bin/bun` under a root-owned trust chain. That makes the QA19 fixed candidate scan select a trusted runtime and run the default TypeScript recorder with restore credentials only under that trust contract.

| Decision | Detail |
|---|---|
| Selected path | `/usr/local/bin/bun` — signed, root-owned, root-owned parent chain |
| Production contract | QA19: refuse credentials to user-owned Bun; accept only `r2_ro_validate_root_bin`-validated candidates (`/opt/homebrew/bin/bun`, `/usr/local/bin/bun`, `/usr/bin/bun`) |
| Superseded proposal | User-owned credential-free recorder branch (non-secret allowlist + `/usr/bin/env -i` Bun path) — **must not be implemented** |
| Forbidden history | Never revive or land rejected fake-recorder commit `31fee195` |
| Product source | **No product-source changes** unless verification exposes a separate real defect. Do not change QA13 or other existing product source when trusted-runtime verification passes. |

### Why the original QA20 MUST list is superseded

The original task asked to replace the root-owned-Bun hard failure with a credential-free path for **user-owned** Bun. That contingency is no longer required: the machine now has a trusted Bun, so Human Gate step 3 succeeds on the QA19 path without weakening credential boundaries or inventing a second recorder env model.

## MUST (resolution execution)

1. Record this human-selected resolution in this task artifact (this file).
2. Verify `/usr/local/bin/bun` with `codesign`, `stat`, and `r2_ro_validate_root_bin`.
3. Prove the runner's fixed candidate scan rejects user-owned Homebrew Bun and selects the trusted `/usr/local/bin/bun` path.
4. Run focused QA19, TypeScript, full Sprint 28 suite, syntax, `git diff --check`, real ignored-`.env` live R2 proof, and hooks.
5. Commit **only** this resolution task artifact (plus fresh task-local verification evidence under `.tmp/GATE-FIX-S28R3-QA20/**` if required), land on `main`, remove task worktree/branch.
6. Preserve `.env`, `.env.example`, Sprint 27, unrelated `.tmp`, primary untracked artifacts, and surface 137.
7. Never print or raw-dump environment values, credentials, or object bodies. Final independent QA owns the exact six human-gate commands; do not fabricate or pre-write its verdict.

## NEVER

Use `--no-verify` · weaken or skip prior tests · pass any credential to user-owned Bun · replace the default TypeScript recorder with a test-only shell recorder in the real gate · change `gate-plan.json` to evade the failure · implement the superseded credential-free user-owned Bun path · log environment/secrets/object bodies · touch Sprint 27, unrelated `.tmp`, `.env`, `.env.example`, or surface 137 · revive `31fee195`

## VERIFY

```bash
# Trust proofs (no secrets)
codesign -dv /usr/local/bin/bun
stat -f '%Su %Sg %Sp %N' /usr/local/bin/bun
# shellcheck: source from worktree
source scripts/lib/r2-ro-live.sh && r2_ro_validate_root_bin /usr/local/bin/bun
# Candidate scan: Homebrew user-owned rejected; /usr/local/bin/bun selected when trusted

pnpm exec tsc --noEmit
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa19-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/run-fire-drill-on-fresh-target.sh scripts/lib/r2-ro-live.sh
git diff --check
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 /bin/bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- this QA20 task artifact only (resolution record)
- `.tmp/GATE-FIX-S28R3-QA20/**` fresh local evidence only (if needed)
- **no** product source, **no** QA13 changes, **no** credential-free recorder implementation

## Resolution evidence notes

Evidence for trusted-runtime selection is produced at verification time and may be summarized under `.tmp/GATE-FIX-S28R3-QA20/` without credentials, env dumps, or object bodies.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA20","source_sha":"bd879c1eb746017992ed9e51a83f4a160cc3413f","resolution":"qa19_trusted_runtime","trusted_bun":"/usr/local/bin/bun","credential_free_user_owned_path_superseded":true,"no_product_source_change":true,"forbidden_commit":"31fee195"}
-->
