# GATE-FIX-S28R3-QA31 — Immutable QA30 Contract and Ambient-Free Prefix Execution

**Status:** Open
**Source review:** `.spec/reviews/red-hat-20260730T231936Z-sprint-28-qa30-40fedb5b.md`
**Blocking findings:** HIGH — QA30 contract absent from immutable history; HIGH — static command-token regression does not observe either real restore consumer in an ambient-free environment.

## Required remediation

1. Commit this task specification (or an equally normative committed contract artifact) together with its acceptance criteria, so the QA30 security/gate correction is reviewable from immutable Git objects.
2. Add a credential-gated disposable integration check that starts with both restore-prefix variables absent, invokes the real provision and fire-drill restore paths with explicit `R2_RESTORE_OBJECT_PREFIX=pgbackrest` and `R2_PGBACKREST_PREFIX=pgbackrest`, and observes the resulting bound restore behavior.
3. When distinct live credentials are available, the positive path is a required external gate: it must receive a real in-window PITR timestamp from `restore:window` (or an equivalent live source of truth) and must fail rather than silently skip when that input is absent. Explicit Docker/Compose runtime setup is infrastructure only and must not bypass consumer assertions.
4. Add a real no-key negative control: it must observe nonzero exit and `DEPENDENCY-S28-R2-RO`, prove no placeholder fallback succeeds, and prove no restore artifact/resource is produced before cleanup; cleanup results must be asserted separately.

## Acceptance criteria

- [ ] The task/contract is versioned in the remediation commit and names the source review and required behavior.
- [ ] The ambient-free integration test unsets both prefixes before exercising the real consumer path, then supplies the explicit tuple to the real consumer entry points.
- [ ] The test’s positive path is credential-gated and disposable; it does not fabricate provider or Docker success.
- [ ] With live credentials present, a real in-window timestamp is required; absent timestamp/runtime is an explicit dependency block, never a passing skip.
- [ ] The no-key path fails closed with `DEPENDENCY-S28-R2-RO`, has no `ALLOW_PLACEHOLDER_R2_RO=1` escape hatch, observes no successful restore artifact/resource before cleanup, and independently asserts cleanup.
- [ ] Existing canonical-policy and explicit-prefix regression coverage remains intact.
- [ ] Focused validation passes; the remediation is committed and landed on `main` without touching unrelated dirty work.

## Constraints

- Do not weaken `gate-plan.json`, human-gate commands, live-R2 enforcement, evidence validation, or command fidelity.
- Do not reuse or hand-write QA verdicts/evidence.
- Use the existing real credentials only through ignored secret configuration; never print or commit them.
- Independent Terra High review and a fresh session-bound six-step QA run are required after landing.
