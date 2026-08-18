# Full-suite validation issues

`pnpm tsc --noEmit` passed (exit 0), `pnpm lint` passed (exit 0, 523 warnings), and
the pre-commit unit suite `pnpm test:unit` passed (66 files, 466 tests, 30 skipped).

The canonical full-suite gate `pnpm test` was run against this evidence-only task and
failed (exit 1): 82 failed files, 156 passed, 129 skipped; 106 failed tests, 1466
passed, 683 skipped. The failures are outside S33-OPS-01 and include:

- integration lanes requiring `PLATFORM_IT=1`;
- Docker/host lifecycle prerequisites unavailable in this environment;
- operator secrets not readable (`GATE-FIX-S28R3-QA25`);
- missing unrelated Convex/module paths in legacy integration tests;
- trusted Bun/pg_ctl dependency checks unavailable.

Raw output is retained in `full-test-output.txt`. Full-suite execution also mutated
tracked unrelated `.tmp/GATE-FIX-*` and `.tmp/sprint-25/*` artifacts; those exact
paths were restored to the branch HEAD before staging S33 evidence.
