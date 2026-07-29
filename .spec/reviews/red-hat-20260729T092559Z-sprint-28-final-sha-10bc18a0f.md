# Red-Hat Final Severity Review — Sprint 28

**Reviewed SHA:** `10bc18a0f49a49e57def7ec3fec39978dc7b65f0` (`main`)
**Review date:** 2026-07-29T09:25:59Z
**Scope:** Full Sprint 28 closeout after `GATE-FIX-S28R3-QA2`, including all Sprint 28 task/fix contracts, the six-step human gate, prior independent report, committed implementation, committed tests, and committed closeout artifacts.
**Mode:** Fresh independent read-only review. The only write made by this review is this report. No product code, gate result/evidence artifact, branch, or checkout state was changed.
**Reviewed by:** root red-hat reviewer, security-reviewer, code-reviewer, and test-quality-reviewer.
**Test-reality lens:** Ran in implemented mode. Static oracle, fixture, and negative-path audits were completed. Mutation and integration-suite execution were not run because this review's explicit no-write scope forbids their `.tmp`/Docker evidence side effects.

## Verdict

**NEEDS-FIXES**

| Severity | Count |
|---|---:|
| CRITICAL | **3** |
| HIGH | **1** |
| MEDIUM | **3** |
| LOW | **0** |

The clean-closeout condition (`CRITICAL=0` and `HIGH=0`) is not met. The missing live distinct restore credentials remain a legitimate external closeout blocker, but are not counted as a code defect; the defects below allow unsafe/fabricated identity or policy proof even if those credentials are later supplied.

## Evidence reviewed

- `AGENTS.md`, `RULES.md`, the complete `/review-red-hat` procedure, and `ANTI-STUB-REVIEW.md`.
- Sprint 28 manifest and every task/fix contract, with focus on `REDHAT-FIX-S28R3`, `GATE-FIX-S28R3-QA1`, and `GATE-FIX-S28R3-QA2`.
- Prior report: `.spec/reviews/red-hat-20260729T084459Z-sprint-28-final-sha-71f12cabe.md`.
- The target commit's gate plan/rendered human gate, archived prior result, restore runner/provisioner/isolation/inventory scripts, CLI/fire-drill/evidence source, and Sprint 28 integration tests.
- Read-only checks: `bash -n` on changed shell entry points; SHA-256 recomputation of each of the six `gate-plan.json` commands against the corresponding rendered `HUMAN-GATE.md` digest; and a bounded non-secret `prove-isolation.sh` policy-shape probe.

The six current rendered command blocks and their digests do match the current plan exactly. `gate-results.json` is absent at this SHA; `gate-results.unbound-20260729T031355Z.json` is historical and unbound; the manifest says **In Progress** and preserves `DEPENDENCY-S28-R2-RO`.

## Acceptance and closeout matrix

| Requirement | Verdict | Evidence |
|---|---|---|
| Minimal restore-only child environment | **FAIL** | The runner uses `env -i` and maps restore keys, but does not reliably prove them distinct from file-backed writer keys; it also forwards `DATABASE_URL` into that child. `scripts/run-fire-drill-on-fresh-target.sh:454-609`. |
| Six literal commands and digests lock | **PARTIAL** | Current plan/rendered commands are byte-identical and all six digest markers match. The regression oracle accepts a hash anywhere in the document instead of hashing the published block. `sprint28-s28r3-qa2-gate-fix.test.ts:184-203`. |
| Required allowlisted `GATE_RUN_ID` | **FAIL** | Live commands silently default to `manual`; the only runtime validator is optional and not reached by steps 1/6. `gate-plan.json:24,61,105`; `scripts/provision-fresh-restore-target.sh:98-113`. |
| Honest closeout state and historical pass handling | **PASS** | `SPRINT.md:4-17`; absent active `gate-results.json`; archived unbound run has null SHA/head/timestamp. |
| `--fresh-target` canonical named-volume destination | **PASS** | Explicit scratch/blob paths must canonical-equal the resolved volume execution paths; unresolvable daemon-only paths fail closed. `services/platform/src/cli/holo.ts:2795-2869`; `scripts/run-fire-drill-on-fresh-target.sh:197-253`. |
| Exact bucket/prefix policy | **FAIL** | Generated policy is exact, but the validator admits a mixed policy with both exact-prefix and bare `bucket/*` object resources. `scripts/prove-isolation.sh:777-793`. |
| Real redacted credential inventory | **PASS** | Inventory reads the supplied secrets file and emits only key names, presence, and lengths. `scripts/inventory-restore-credentials.sh:45-111`. |
| Full-runner, cleanup, and command-fidelity coverage | **PARTIAL** | Recorder and daemon tests exist, but key success/fidelity and operator cleanup assertions remain weak. `sprint28-s28r3-qa2-gate-fix.test.ts:184-203,515-576,784-915`; gate plan step 3. |

## CRITICAL findings

### C-1 — File-backed duplicate writer/restore identities bypass the distinct-credential gate

`load_restore_keys_from_secrets` imports only `R2_RESTORE_*` from `secrets.yaml` (`scripts/run-fire-drill-on-fresh-target.sh:454-471`). The supposed ambient writer comparison is sourced solely from the inherited process environment (`:476-502`). If the secrets file contains equal values for `R2_RESTORE_ACCESS_KEY_ID` / `R2_RESTORE_SECRET_ACCESS_KEY` and the writer `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, while the shell environment does not, neither equality check fires. The runner then maps that same identity to the child `R2_ACCESS_*` keys (`:566-569`) and starts it under `env -i` (`:607-609`).

The C1 test forces an absent secrets file, so it cannot expose this file-only equality case (`services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts:543-545,811-812`). This violates the required distinct live restore identity and creates a writer-credential false-positive green path.

**RUN-lane fix:** parse the writer and restore identity values from the same selected secrets source before the comparison (or use a common validated credential resolver), reject equal access-key or secret values regardless of source, and add a secrets-file-only equal-identity negative that proves the child recorder is never invoked.

### C-2 — The fresh-target child receives `DATABASE_URL` and queries the live source

The minimal child allowlist explicitly forwards `DATABASE_URL` (`scripts/run-fire-drill-on-fresh-target.sh:574-585`). `runFireDrill` then unconditionally constructs and queries a live pre-failure source connection before restoring (`services/platform/src/backup/fire-drill.ts:815-845`). `defaultSourceConnection` selects the forwarded `DATABASE_URL` (`services/platform/src/backup/evidence-ledger-verify.ts:399-408`).

Consequently, a restore running on the fresh target gets production database credentials and attempts to reach the original mini even when an immutable R2 recovery baseline is available. This breaches the no-mini-access requirement and contradicts the claimed minimal restore-only child environment.

**RUN-lane fix:** do not pass `DATABASE_URL`, `PG*`, or other live-source connection credentials to the fresh-target child. In `freshTarget` mode, skip live pre-failure diagnostics entirely and require/consume the R2 recovery baseline. Add a recorder/connection test proving no live source connection is attempted and that the child environment has no database credentials.

### C-3 — Required `GATE_RUN_ID` is documentation-only; authoritative commands accept shared or path-controlled state

The rendered precondition says an ID is required, but its authoritative commands use `${GATE_RUN_ID:-manual}` for step 1, step 3 host naming, and step 6 (`gate-plan.json:24,61,105`; rendered at `HUMAN-GATE.md:44,64,94`). No plan command requires a nonempty variable or validates the allowlist before constructing paths. The provisioner validates it only when it is already nonempty (`scripts/provision-fresh-restore-target.sh:108-113`); steps 1 and 6 do not invoke that validator. QA2 tests verify prose/digest presence, while its bad-ID test also supplies an invalid host and short-circuits at host validation (`sprint28-s28r3-qa2-gate-fix.test.ts:168-222,920-937`).

An operator can run the documented literal commands unset and reuse `manual` scratch/host state; a malformed ID can flow into step-1/6 paths. This reopens the gate-isolation/command-integrity part of the prior C2 finding.

**RUN-lane fix:** prepend a shared preflight to every live literal command: reject absent IDs and require `^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$`; remove all `:-manual` live defaults. Test unset and malformed IDs for steps 1, 3, and 6, proving no scratch path, Docker resource, or attestation is created.

## HIGH finding

### H-1 — Exact-prefix validation accepts a policy that also grants whole-bucket object reads

The isolation validator only rejects bare `arn:aws:s3:::bucket/*` when it cannot find any exact-prefix ARN at all (`scripts/prove-isolation.sh:777-785`). A policy with both `arn:aws:s3:::holocron-backup/pgbackrest/*` and `arn:aws:s3:::holocron-backup/*` therefore passes the branch; subsequent checks only search for List/Get action tokens (`:786-793`). Gate step 2 uses this validator as the policy/isolation verifier (`gate-plan.json:48`).

A bounded probe with deliberately non-secret fake values and that mixed policy returned `AXIS r2_readonly: PASS` and overall `RESULT: PASS` at the reviewed SHA. The existing test covers bare-only vs exact-only policy, but not the mixed authorization case (`sprint28-s28r3-qa2-gate-fix.test.ts:238-335`). Thus a bucket-wide read credential can be attested as prefix-scoped.

**RUN-lane fix:** parse the policy JSON and inspect every Allow statement/resource/action combination. Reject any object resource matching `arn:aws:s3:::<bucket>/*`, wildcard bucket, different bucket, or prefix outside the configured exact restore prefix—even when a valid prefix resource also appears. Add a mixed-resource negative and require a nonzero overall result.

## MEDIUM findings

1. **Published-command digest regression test is weak.** It accepts the current plan hash anywhere in `HUMAN-GATE.md` (`sprint28-s28r3-qa2-gate-fix.test.ts:184-203`) instead of extracting each numbered fenced block and hashing it. Current content is correct, so this is a regression-detection gap rather than a current drift finding. Parse/hash the rendered block for every step and compare it to the corresponding plan command.

2. **Full-run recorder tests do not assert a successful runner exit.** C1 and M1 prove the recorder was reached and sees mapped credentials, but do not require `run.status === 0` (`sprint28-s28r3-qa2-gate-fix.test.ts:515-576,784-843`). A later runner failure can still produce a green test. Assert exit 0, completed attestation, and expected report result.

3. **The manual gate trap leaves its Docker network behind.** Step 3 removes container and volumes but not `${HOST}-net`; provisioning creates that network (`gate-plan.json` step 3; `scripts/provision-fresh-restore-target.sh:213,389-391`). QA2 `afterEach` removes the network (`sprint28-s28r3-qa2-gate-fix.test.ts:57-71`), masking operator-run repeatability leakage. Include network removal in the trap and test a failed/repeated manual path.

## Prior CRITICAL/HIGH disposition

| Prior finding at `71f12cabe…` | Disposition at `10bc18a0…` |
|---|---|
| C1: ambient writer reaches fire-drill | **Partially remediated, still CRITICAL.** `env -i` mapping is present, but file-only equal writer/restore identities bypass distinctness (**C-1**) and `DATABASE_URL` leaks a live source channel (**C-2**). |
| C2: human surface drift | **Rendered commands/digests resolved**, but **reopened as C-3** because the required run ID is unenforced in the sole-authoritative commands. |
| C3: stale unbound pass / false Completed status | **Resolved.** Sprint is In Progress; the unbound pass is archived; no active result exists. |
| H1: arbitrary writable fresh-target destinations | **Resolved.** CLI requires canonical equality to actual resolved named-volume host paths and the runner refuses inaccessible daemon-only paths. |
| H2: whole-bucket restore policy | **Partially remediated, still HIGH.** Emitted plan/provisioner policy is exact, but mixed exact-plus-bare policy passes the isolation verifier (**H-1**). |
| H4: manufactured credential inventory | **Resolved.** The committed inventory is source-backed and redacted; it preserves the external residual when keys are absent. |

## External dependency disposition

The absence of distinct live `R2_RESTORE_*` credentials is correctly represented as `DEPENDENCY-S28-R2-RO`: no active `gate-results.json` claims a current pass, and Sprint 28 remains In Progress. This is the correct non-fabricated external closeout state. It does not excuse the code paths above, which must reject equal credential identities and prevent live-source access once credentials are supplied.

## Final

**Reviewed SHA:** `10bc18a0f49a49e57def7ec3fec39978dc7b65f0`  
**Counts:** CRITICAL **3**, HIGH **1**, MEDIUM **3**, LOW **0**  
**Verdict:** **NEEDS-FIXES**

