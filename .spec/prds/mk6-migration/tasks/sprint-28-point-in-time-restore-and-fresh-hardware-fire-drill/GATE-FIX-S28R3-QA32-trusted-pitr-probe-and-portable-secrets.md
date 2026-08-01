# GATE-FIX-S28R3-QA32 — Trusted PITR Probe and Portable Secret Discovery

**Status:** Open
**Source review:** `.spec/reviews/red-hat-20260801T002134Z-sprint-28-main-sha-c787337843cc.md`
**Reviewed SHA:** `c787337843cc4f0066795a6a28b28cffd01dd253`
**Blocking finding:** HIGH — the credentialed PITR-window preflight passes live R2 secrets to an executable chosen without ownership, mode, or symlink trust validation.
**Additional findings:** MEDIUM — checkout-specific absolute secret/tool fallbacks; LOW — trailing whitespace in the immutable QA30 review copy.

## Required remediation

1. Before constructing or passing any credential-bearing environment, resolve the PITR probe to a fixed absolute executable and validate the same root-owned, non-symlink, non-group/world-writable trust class used by the real credentialed consumer. On this host `/usr/local/bin/bun` is the expected trusted candidate; an absent or untrusted executable must produce an explicit dependency failure without launching a credentialed child.
2. Remove every hard-coded `/Users/inference1/...` secret and Bun fallback from the QA31 integration test. Secret discovery must be limited to an explicit `HOLO_QA31_SECRETS_PATH`/existing project secret override or ignored repository-relative files in the checkout under test.
3. Add discriminating regression coverage for the trust check: the trusted executable path reaches the real `restore:window` probe, while a symlink, user-owned, or writable substitute cannot receive the credential environment or fabricate a window.
4. Re-run the disposable credentialed positive path and the no-key negative control and refresh their durable, redacted QA32 evidence. Never print or commit raw keys/tokens/passwords.
5. Remove the reported trailing whitespace from the committed QA30 review artifact without changing its meaning.

## Acceptance criteria

- [ ] No live credential is placed in a child environment until the exact Bun executable has passed fixed-path ownership, symlink, and write-mode validation.
- [ ] The trusted probe cannot fall back to Homebrew/user-home Bun paths; absence or failed trust validation is a named non-passing dependency outcome.
- [ ] The test contains no hard-coded user-home/project checkout path; secret discovery is explicit or repository-relative only.
- [ ] A negative trust-boundary test proves an untrusted executable cannot observe credentials or fabricate PITR-window success.
- [ ] The real ambient-free explicit-prefix positive path and no-key negative control remain discriminating, disposable, and produce redacted executed evidence.
- [ ] `git diff --check` for the remediation range passes.
- [ ] Gate-plan, human-gate literal commands, evidence validators, live-R2 enforcement, and command fidelity are not weakened.
- [ ] The remediation is independently reviewed by Terra High and lands on `main`; a fresh session-bound six-command QA follows.

## Constraints

- Preserve unrelated dirty work and unrelated cmux surfaces.
- Do not hand-write gate verdicts or reuse prior QA evidence as a final verdict.
- Do not broaden credential access, weaken distinct read-only restore-key enforcement, or introduce a passing skip when live prerequisites are configured.
