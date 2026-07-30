# GATE-FIX-S28R3-QA24 — Live production proof and token transport closure
> Status: ✅ Completed
> Commit: 18bfeb27f45bb1aedbba0ad1d02e44236a310894
> Reviewer: code-reviewer+code-reviewer
> Completed: 2026-07-30T04:34:03Z

**Task id:** `GATE-FIX-S28R3-QA24`
**H1 id:** `GATE-FIX-S28R3-QA24`
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill
**Binding review:** `red-hat-20260730T020758Z-sprint-28-main-sha-4630c1b4aa6019507af13435862801777b11a93d`
**Source SHA:** `4630c1b4aa6019507af13435862801777b11a93d`

## Intent

Close all six CRITICAL findings and the HIGH full-suite failure from the binding Terra review with real production-path evidence.

1. Remove the Cloudflare management token from curl/process argv on the temporary R2 credential mint route.
2. Remove or validate every credential-ambient executable override in `prove-isolation.sh`, including the remaining bare shell execution.
3. Replace the substituted QA23 launcher/redactor canary with an actual production provider/fresh-target boundary test and exhaustive artifact scan.
4. Produce and validate one durable machine-readable full-suite → live R2 proof → full-suite record.
5. Add a production-path race/canary integration test that cannot enable QA21 harness-only overrides.
6. Replace recorder/placeholder D05-04 success evidence with a real disposable restore using non-zero seeded data and real trusted pgBackRest/restic tooling.
7. Repair the QA6 digest, QA9 failure oracle, and QA18 obsolete implementation assertion so both exact full suites pass for current behavior.

## Acceptance criteria

- [ ] The Cloudflare management token reaches the real mint client only through protected stdin/FD or an equally non-argv channel. A canary test observes the actual mint child argv and recursively scans retained files/output; no token appears.
- [ ] `prove-isolation.sh` has no unvalidated executable override or bare credential-ambient shell. All reachable tools are fixed absolute paths or validated root-owned executables before credentials exist.
- [ ] The hostile-PATH test runs the literal gate stream through its credentialed isolation descendant, requires a reached/success marker, injects malicious override values as well as ordered PATH shadows, and fails on any marker.
- [ ] The credential transport canary executes the actual `run-fire-drill-on-fresh-target.sh`/`r2_ro_run_provider` production boundary against a disposable target with non-production canaries. It observes real launcher and child PIDs/argv and recursively scans every retained output, evidence artifact, and sacrificial object body without exclusions.
- [ ] One durable immutable JSON record captures the exact clean-state sequence: full Sprint 28 suite, mandatory live R2 readonly proof, full Sprint 28 suite. It includes exact commands, exit codes, test totals, probe hashes before/after every phase, `.qa16bak` absence, SHA, run id, timestamps, and evidence pointers. A deterministic validator recomputes and rejects any dropped, reordered, or failing phase.
- [ ] QA21 seam tests remain, but a separate production-path integration test forces proof-file and parent-directory replacement races and all canary failure/success cases without harness-only fake-volume, fake-CLI, placeholder, or mutation overrides.
- [ ] D05-04 executes a real disposable fresh-target restore with real trusted pgBackRest/restic, non-zero seeded PostgreSQL and object data, and independent row/object parity. Recorder-written success fields, placeholder R2, synthetic identifiers, and `skipResticVerify` cannot satisfy the oracle.
- [ ] If signed/root-owned pgBackRest/restic are unavailable, record the exact operational blocker and stop; never weaken trust or substitute a recorder. The implementation may proceed while the prerequisite is being installed, but task completion requires the real proof.
- [ ] QA6 frozen digests are updated from the authoritative literal commands, QA9 observes the current fail-closed diagnostic/path, and QA18 asserts the new FD transport contract rather than removed `env -i` source text.
- [ ] D05-01 through D05-06 continue to pass the current scenario validator with zero CRITICAL/HIGH findings.
- [ ] All QA21–QA23 security, race, SigV4, count/default, evidence, hermeticity, rejected-commit, and whitespace closures remain intact.
- [ ] TypeScript, focused QA24/QA23/QA22/QA21 tests, shell/Python checks, hooks, two exact full suites around live R2, the real disposable restore, durable-record validator, and dual-lens product/security/test-quality review all pass.

## Status

Implemented (D05-04 real restore blocked on root-owned pgbackrest/restic — see `.tmp/GATE-FIX-S28R3-QA24/trusted-tool-probe.json`).
