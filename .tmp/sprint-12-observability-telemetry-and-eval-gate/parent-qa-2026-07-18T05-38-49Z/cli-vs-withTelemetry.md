# CLI `infer:call --escape` vs `runBudgetedEscapeWithTelemetry`

## Distinction (authoritative)

| Path | API | Writes `budget_ledger` | Writes `inference_telemetry` | Cross-ledger join |
|------|-----|------------------------|------------------------------|-------------------|
| Operator CLI `holo infer:call --escape` | `runBudgetedEscape` (budget-ledger.ts) via `holo.ts` | **yes** | **no** (CLI does not call the telemetry wrapper) | ledger-only for this CLI path |
| Integration AC-3 / production telemetry path | `runBudgetedEscapeWithTelemetry` (telemetry.ts) | **yes** | **yes**, with `budget_ledger_id` set | **joinedBy = budget_ledger_id** |

## Parent QA treatment

1. **Fail-closed (missing Anthropic):** proven live via clean-env CLI (`env -i … HOLO_DISABLE_DOTENV=1`) → exit 1, `anthropicCount=0` (payload on stderr in this capture).
2. **CLI green escape:** proven live → real Anthropic contact + `budget_ledger` row (ledger id retained). This alone is **not** the telemetry↔ledger correlation proof.
3. **Telemetry↔ledger correlation:** proven live by non-skippable `PLATFORM_IT=1` suite
   `services/platform/tests/integration/inference-telemetry.test.ts` AC-3 using `runBudgetedEscapeWithTelemetry`, artifact `AC-3-budgeted-escape.live.json` with `correlation.joinedBy = "budget_ledger_id"`.
4. Historical H-2 GREEN package (`.tmp/redhat-fix-h2-green/`) remains ancestry-visible and manifest-OK as retained proof.

## Code pointers

- CLI: `services/platform/src/cli/holo.ts` case `infer:call` → `runBudgetedEscape`
- Wrapper: `services/platform/src/inference/telemetry.ts` → `runBudgetedEscapeWithTelemetry`
- AC-3 test: `services/platform/tests/integration/inference-telemetry.test.ts`
