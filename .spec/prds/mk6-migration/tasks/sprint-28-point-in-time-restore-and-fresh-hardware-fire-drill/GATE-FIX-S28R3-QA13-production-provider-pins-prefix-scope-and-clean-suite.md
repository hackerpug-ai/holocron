# GATE-FIX-S28R3-QA13 — Production provider pins + prefix scope + clean suite

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality / security  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T164053Z-sprint-28-main-sha-67ec855c93394c7b98f9207a916a54c98c1b4fd6.md` on `67ec855c93394c7b98f9207a916a54c98c1b4fd6`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes

## Outcome

Remove every production provider-injection seam, prove the exact Cloudflare account/bucket/`pgbackrest/` read scope, close proof-consumption TOCTOU, and make the complete Sprint 28 suite reproducible from a frozen clean checkout.

## Findings

1. **CRITICAL-1:** live mode accepts a caller-selected committed fake AWS provider.
2. **CRITICAL-2:** `--try-mint` still executes caller-selected `curl` from `PATH` with bearer material.
3. **HIGH-1:** endpoint/account and prefix-scoped read policy are not authoritatively established.
4. **HIGH-2:** clean frozen root installation cannot resolve `drizzle-orm/postgres-js` for the full suite.
5. **MEDIUM-1:** proof consumption uses `lstat` then followable `open`, leaving a TOCTOU race.
6. **MEDIUM-2:** the two-consumer mutation and all-evidence canary matrix is incomplete.

## MUST

1. Production/live paths must not accept `HOLO_TRUSTED_AWS_BIN`, fixture directories, test providers, caller-selected binaries, or any environment/provider override. Resolve AWS only from a fixed production allowlist independent of caller `PATH`, canonicalize through `realpath`, validate expected file type/owner/non-group-world-writable chain, and execute under a minimal `env -i`.
2. Pin mint transport the same way: use only fixed trusted absolute `curl` locations (prefer the root-owned `/usr/bin/curl` where present), validate ownership/mode/realpath, execute under a minimal `env -i`, and reject all caller/test overrides in production. No bearer token or parent access-key material may reach an untrusted process.
3. Move test-provider injection entirely outside production code paths. Tests needing provider doubles must generate an isolated copied/mutated harness or replace a compile-time constant in a temporary copy; the committed production consumers must contain no runtime switch that a caller can enable. Add explicit adversarial tests proving fixture paths and forged `PATH` entries are never executed by production consumers or minting.
4. Derive the only accepted endpoint exactly from canonical `R2_ACCOUNT_ID`: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; reject any supplied endpoint mismatch, alternate host, port, path, query, fragment, userinfo, or normalization ambiguity. Bind the derived endpoint, exact bucket `holocron-backup`, prefix `pgbackrest/`, and canonical policy to evidence.
5. Treat the gate policy as prefix-scoped Object Read only exactly as declared by `gate-plan.json`: List/GetBucketLocation on `holocron-backup`, GetObject only on `holocron-backup/pgbackrest/*`. Establish it at the provider boundary with in-prefix List + Head/Get success, out-of-prefix List/Head/Get denial, and generated Put/Delete denial. Fail when permissions are broader, the prefix differs, or any expected object is absent.
6. Open proof evidence for consumption through a validated directory FD with `O_NOFOLLOW`, then `fstat` the returned FD and parse only that same FD. Eliminate `lstat`→plain-open races and reject any parent/file replacement.
7. Make `services/platform` part of the locked pnpm workspace (or otherwise provide a locked root install contract) so `pnpm install --frozen-lockfile` in a clean checkout installs `drizzle-orm` and `postgres`, and the literal full `sprint28-*.test.ts` command passes. Update workspace/package/lock artifacts only as needed and add a clean-install resolution assertion.
8. Execute stale/future/malformed/wrong-tuple/wrong-producer/wrong-context mutations through both actual consumers using isolated copies where provider injection is required. Removing any validation from either consumer must fail.
9. Exercise AWS and Cloudflare mint success/error paths with unique canaries, plus recorder output, parity report, proof, attestation, and every evidence file. Assert no canary appears anywhere and every real child exit/report contract is checked.
10. Run focused QA8–QA13 tests, complete `sprint28-*.test.ts` from a fresh frozen install, shell syntax checks, and a real ignored-`.env` proof using a credential actually scoped to `pgbackrest/`. Land on `main` with hooks enabled and remove the task worktree/branch.

## NEVER

Accept a production provider override · allow committed fixtures as live authority · use bare `aws` or `curl` · accept an endpoint not derived from account ID · claim prefix scope without out-of-prefix denial · follow proof symlinks · skip either consumer in mutations · hand-edit gate verdict/evidence · touch Sprint 27, unrelated `.tmp`, `.env`, or surface 137

## VERIFY

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa11-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa12-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa13-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh scripts/lib/r2-ro-live.sh
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- the R2 prover/consumer/helper scripts
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `services/platform/package.json` only as required for clean frozen installation
- QA8–QA12 tests/fixtures and `services/platform/tests/integration/sprint28-s28r3-qa13-gate-fix.test.ts`
- focused copied-harness/mutation/provider fixtures that cannot be reached by production live paths
- this task and Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA13/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA13","reviewed_sha":"67ec855c93394c7b98f9207a916a54c98c1b4fd6","findings":["CRITICAL-1","CRITICAL-2","HIGH-1","HIGH-2","MEDIUM-1","MEDIUM-2"],"no_production_provider_override":true,"aws_and_curl_pinned":true,"endpoint_account_bound":true,"pgbackrest_prefix_scope_proved":true,"proof_fd_no_follow":true,"clean_frozen_suite":true,"two_consumer_mutations":true}
-->

