# GATE-FIX-S28R3-QA27 — Exact evidence allowlist and real production boundary

> Status: ✅ Completed
> Commit: e6fc8db55ba99fbdc3ca489adf54c615e3570b1e
> Reviewer: internal dual-lens pending land
> Completed: 2026-07-30T16:47:13Z

**Task id:** `GATE-FIX-S28R3-QA27`
**Sprint:** sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill
**Binding review:** `red-hat-20260730T155407Z-sprint-28-main-sha-b97293e5a72efb62bae70700988daf2adc5f2393.md`
**Source SHA:** `b97293e5a72efb62bae70700988daf2adc5f2393`

## Intent

Close all three HIGH and one MEDIUM findings from the binding independent Terra High review without weakening provenance, production-boundary, lifecycle, destructive-mutation, credential, parity, or cleanup contracts.

## Acceptance criteria

- [x] Replace the QA26 whole-directory post-bind allowlist with an exact closed set of committed evidence files. Exact phase-log paths may be derived only from a strictly validated record/run id and must match the three declared phases. Exact D05 bundle/run artifacts and the exact task-status file must be enumerated. Unlisted files, nested paths, alternate extensions, symlinks, mode changes, and executable files fail closed.
- [x] Mutation tests create commits after the record-bound code SHA containing an executable below the former evidence prefix, an unlisted nested file, a changed validator/test/product file, a mode-only executable change, and a non-ancestor record SHA. The unchanged final validator rejects every mutation and accepts only the final immutable evidence commit.
- [x] A real production-boundary test invokes the actual `provision-fresh-restore-target.sh` and `run-fire-drill-on-fresh-target.sh` entrypoint chain in a disposable namespace. A deliberately failed provision with a present `paths.txt` must return non-zero; a stand-alone generated shell fragment cannot satisfy the oracle.
- [x] The boundary test is detached/path-independent and retains a durable redacted transcript proving the actual launcher/child PIDs and argv shape, provision/fire-drill reach markers, and absence of unredacted credential values in stdout, stderr, retained logs, and evidence bodies.
- [x] The actual production provision/fire-drill cleanup path runs twice with unique QA27 namespaces. After each run, inventory proves zero matching containers, retry containers, networks, volumes, staging directories, child PIDs, and retained child logs. Unrelated Docker resources remain untouched.
- [x] The production D05 read-only consumer’s destructive controls mutate disposable copies and prove rejection for missing/replaced/mismatched baseline bindings, each expected/restored object identity list, and every oracle-manifest hash/size link, in addition to existing parity/attestation/summary/delete/zero cases.
- [x] Preserve the already-closed trusted executable, NUL framing, redactor FD, real D05 positive bundle, row parity, 11-object identity parity, and exact whitespace contracts.
- [x] Because validator/tests/production paths change, freeze a new final code commit, rerun the real D05 proof and full-suite → live R2 → full-suite sequence, then add only the exact immutable evidence/task files in a later evidence commit. Both suites must have non-zero recomputed totals and the live proof must exit 0.
- [x] The exact Sprint 28 suite, focused QA21–QA27 tests, real production boundary twice, lifecycle inventory, strengthened sequence validator, D05 consumer positive/destructive controls, exact diff check, and independent dual-lens review all pass.
- [x] Fresh independent review is bound to the final stable evidence commit with `CRITICAL=0` and `HIGH=0` before landing. The primary checkout remains on `main`; user WIP, `.env`, Sprint 27 artifacts, unrelated `.tmp` changes, surface 137, surface 205, and `stash@{0}` remain untouched.

## Required durable outputs

- Exact-file post-bind provenance manifest plus accepted/rejected mutation evidence.
- Actual production-boundary failure and two-run lifecycle transcripts, fully redacted.
- D05 baseline/identity/manifest destructive-control results.
- New real D05 bundle and full-suite/live/full sequence bound to the new frozen code SHA.
- Exact diff, resource inventory, and independent-review evidence.
