# GATE-FIX-S28R3-QA25 — Independent proof oracles and trusted descendants

> Status: ✅ Completed

**Task id:** `GATE-FIX-S28R3-QA25`
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill
**Binding review:** `red-hat-20260730T044725Z-sprint-28-main-sha-552515ab5d41f1437a20de04ec82a5657acf84dd.md`
**Source SHA:** `552515ab5d41f1437a20de04ec82a5657acf84dd`

## Intent

Close all five CRITICAL and two HIGH findings from the binding independent Terra High review without weakening any refusal, trust, or parity contract.

1. Remove every remaining bare or insufficiently validated executable from credential-bearing restore, baseline, isolation, and provider descendants.
2. Make the fire-drill redaction FD fail closed on read, decode, or shape failure before any child log can be retained or emitted.
3. Replace the failure-before-child canary/race proof with a successful disposable production-boundary execution that reaches and observes the real credentialed child.
4. Make full-suite/live/full evidence immutable and recomputable from committed logs bound to the exact reviewed SHA.
5. Commit and consume the actual D05-04 attestation/parity/baseline evidence bundle, including non-zero database and object identities/counts.
6. Reject truncated or unterminated NUL-protocol records in `exec-env-from-fd.py`.
7. Restore `git diff --check` cleanliness for the full remediation range.

## Acceptance criteria

- [ ] Every credential-bearing `aws`, `psql`, `pg_ctl`, PostgreSQL, Docker, shell utility, pgBackRest, restic, and override path resolves a fixed absolute executable and applies the project root-trust validator before credentials are constructed or ambient. Bare and user-owned fallbacks fail closed. This includes `restore.ts`, `r2-provision.ts`, `recovery-baseline.ts`, `prove-isolation.sh`, and every descendant reached by the literal gate stream.
- [ ] Literal hostile-PATH/override tests reach every real credentialed descendant and require success/reached markers. Any ordered shadow or malicious override marker fails the test.
- [ ] Fire-drill log redaction suppresses and removes the child log and exits non-zero on redactor FD read/decode/shape failure. A canary child log proves no secret reaches stdout, stderr, retained files, or object bodies in that failure mode.
- [ ] A successful disposable production-boundary test reaches the actual `run-fire-drill-on-fresh-target.sh` FD launcher and real credentialed child, samples launcher and child argv/PIDs, executes proof-file and parent-directory races, and recursively scans all retained artifacts. Fake credentials or an early failing proof cannot satisfy the oracle.
- [ ] The full-suite → live R2 → full-suite validator requires every declared log, recomputes exit codes and exact Vitest totals from those logs, verifies the live proof result, stable probe hashes, `.qa16bak` absence, run id/timestamps, and binds `git_sha` to the exact commit. It rejects missing/dangling logs, self-asserted totals, zero-filled records, reordered phases, and replacement of an immutable completed record.
- [ ] The committed sequence evidence references logs that exist in the same durable bundle, has two 31-file/327-test passing suites around a live proof exit 0, and passes the strengthened validator from a clean detached checkout.
- [ ] The committed D05-04 evidence bundle includes the real attestation with exit 0, full parity report, baseline lookup/content key and SHA-256 binding, ledger SHA-256/checksum match, covering pgBackRest label, restic snapshot, exact non-zero source/restored row counts, and all 11 restored/matched object identities/counts. All linked paths exist in the same durable bundle.
- [ ] An implemented test consumes and recomputes the D05-04 bundle; deleting, replacing, mismatching, or zeroing the summary/attestation/parity/baseline artifacts fails.
- [ ] `exec-env-from-fd.py` requires a final NUL terminator and rejects truncated/trailing malformed records; focused negative controls prove the rejection.
- [ ] `git diff --check 4630c1b4aa6019507af13435862801777b11a93d..HEAD` exits 0; versioned evidence has no blank EOF whitespace faults.
- [ ] The real D05-04 proof is rerun if code changes could affect execution or evidence shape. No recorder, synthetic identifiers, or summary-only substitute can satisfy completion.
- [ ] D05-01 through D05-06 scenario contracts, TypeScript, focused QA21–QA25 tests, shell/Python checks, the exact full Sprint 28 suite, live R2 proof, strengthened sequence validator, evidence consumer, and dual-lens independent review all pass.
- [ ] Independent review is bound to the final branch commit before landing; primary checkout WIP and the existing backup stash remain untouched.

