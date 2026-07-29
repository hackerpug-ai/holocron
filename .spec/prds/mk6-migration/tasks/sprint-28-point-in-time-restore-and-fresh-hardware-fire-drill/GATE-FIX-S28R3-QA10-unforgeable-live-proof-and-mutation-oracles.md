# GATE-FIX-S28R3-QA10 — Unforgeable live proof + mutation-resistant oracles

> Status: ✅ Complete  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T153429Z-sprint-28-sha-01210a767814.md` on `01210a76781414d95f23aba14fdf0cf746731c64`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Remove the caller-forgeable proof bypass. Every live provision/fire-drill consumption must execute a fresh R2 List/Put/Delete denial proof for the exact effective tuple. Make the tests fail under the mutations identified by Terra.

## Findings

1. **CRITICAL-1:** six targeted security mutations leave the QA8/QA9 focused suite green.
2. **HIGH-1:** caller-controlled unsigned `HOLO_R2_RO_PROOF_PATH` JSON can bypass the live permission oracle.
3. **MEDIUM-1:** fire-drill canonical token resolution can select writer `R2_SESSION_TOKEN` before restore `R2_RESTORE_SESSION_TOKEN`.
4. **LOW-1:** mint failure prints arbitrary Cloudflare error/raw-response content without credential redaction.

## MUST

1. In `REQUIRE_LIVE_R2_RO=1` mode, always execute `prove-r2-readonly.sh` immediately before each provision/fire-drill tuple consumption. Do not trust any caller-supplied existing proof file as authority.
2. If an attestation is retained for evidence, create/overwrite a private mode-0600 file from the current in-process proof. Bind full tuple plus endpoint/bucket/prefix/policy context. Existing/malformed/stale/future/caller-written JSON must never skip the live probe.
3. Resolve the fire-drill token as explicit `R2_RESTORE_SESSION_TOKEN` env first, then canonical-file restore token. Never substitute canonical writer `R2_SESSION_TOKEN` into the restore tuple.
4. Build deterministic fake Docker/volume/child fixtures so the fire-drill recorder must execute. Assert redacted token metadata, exact restore-token selection, and absence of raw credential values in stdout/stderr/evidence.
5. Add process tests that fail for every review mutation:
   - bypassed unknown-writer-secret rejection;
   - file token overriding explicit environment token;
   - removed stale/future/malformed/mismatched proof rejection or skipped live proof;
   - removed child session-token forwarding;
   - sacrificial-key predicate forced true / live-key denylist removed;
   - raw Access Key ID or credential canary logged.
6. Test explicit env/file conflicts containing distinct writer and restore session tokens; the child must receive only restore-token metadata.
7. Sanitize mint errors to fixed status/error-code classes. Never print raw body, arbitrary message objects, or credential-shaped fragments.
8. Run focused QA8/QA9/QA10 tests, mutation probes, all `sprint28-*.test.ts`, shell syntax checks, and the real ignored-`.env` live proof. Commit to `main` with hooks enabled and remove the task worktree/branch after landing.

## NEVER

Trust an unsigned caller proof · skip a fresh live proof in live mode · log credentials or raw remote errors · accept unknown/equal writer secret · substitute writer session token · weaken sacrificial-key denylist · hand-edit gate verdict/evidence · touch Sprint 27 / unrelated `.tmp` changes / surface 137

## VERIFY

```bash
pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- the four QA9 R2/restore scripts
- QA8/QA9 tests and `services/platform/tests/integration/sprint28-s28r3-qa10-gate-fix.test.ts` (NEW)
- this task and optional Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA10/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA10","reviewed_sha":"01210a76781414d95f23aba14fdf0cf746731c64","findings":["CRITICAL-1","HIGH-1","MEDIUM-1","LOW-1"],"fresh_live_proof_each_consumption":true,"caller_proof_authority":false,"mutation_resistance_required":true,"raw_error_logging_forbidden":true}
-->
