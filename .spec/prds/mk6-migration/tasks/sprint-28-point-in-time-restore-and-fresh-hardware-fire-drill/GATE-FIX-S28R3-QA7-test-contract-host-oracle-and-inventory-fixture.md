# GATE-FIX-S28R3-QA7 — Test-contract host oracle + self-contained inventory fixture

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality  
> Reviewer: code-reviewer + test-quality-reviewer + product-manager  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T112018Z-sprint-28-final-sha-a5b32f30678.md` on `a5b32f30678c167fbae69f2cd370431eec1af25b`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa7-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Repair **only** cumulative test-contract findings HIGH-1 and MEDIUM-1. QA6 product gate behavior remains byte-identical. Preserve **DEPENDENCY-S28-R2-RO**.

## Findings (Terra)

1. **HIGH-1:** `sprint28-s28r3-qa3-gate-fix.test.ts` always-on oracle still requires removed naïve `HOST="s28r3-gate-${GATE_RUN_ID}"`.
2. **MEDIUM-1:** QA2 H4 + gate-bind AC-6 inventory tests depend on personal/ignored `secrets.yaml` or env secrets path; fail in clean archive.

## MUST

1. Update QA3 always-on oracle: require `HOST="$(bash scripts/derive-s28-fresh-host.sh)"`; explicitly reject bare `HOST="s28r3-gate-${GATE_RUN_ID}"`; keep run-ID preflight, full-ID evidence path, network-cleanup assertions.
2. Commit non-secret inventory fixture (absent/placeholder-shaped values only). Never accepted as live restore credentials; inventory still presence/length-only; residual when restore absent.
3. Point always-on inventory unit contracts at the fixture (not personal secrets). Any live/secret-backed check stays `PLATFORM_IT`-gated and fails closed without live inputs.
4. RED evidence first; then GREEN focused + full `sprint28-*.test.ts` from clean/archive-equivalent env (unset HOLO*_SECRETS_PATH).

## NEVER

Change product scripts · gate-plan.json · HUMAN-GATE.md · six literal_cmd · validators · active gate-results/evidence · fabricate R2_RESTORE · claim 6/6 · Sprint 27 / `.tmp/D05-*` / surface 137 / orchestration state

## VERIFY

```bash
# clean env
env -u HOLO_SECRETS_PATH -u HOLOCRON_SECRETS_PATH pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
env -u HOLO_SECRETS_PATH -u HOLOCRON_SECRETS_PATH pnpm exec vitest run \
  services/platform/tests/integration/sprint28-*.test.ts
```

## WRITE-ALLOWED

- `services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts`
- `services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts`
- `services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts`
- `services/platform/tests/fixtures/sprint28/**` (NEW non-secret fixture)
- SPRINT.md task row (optional)
- Terra report if untracked; dual-lens reviews
- `.tmp/GATE-FIX-S28R3-QA7/**` evidence (local)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA7","reviewed_sha":"a5b32f30678c167fbae69f2cd370431eec1af25b","findings":["HIGH-1","MEDIUM-1"],"tdd_mode":"red_first","residual_preserved":"DEPENDENCY-S28-R2-RO","product_frozen":true}
-->
