# service-5-FIX-tripwire

## What changed

1. **`services/platform/src/mastra/tripwire.ts`** — reusable helpers:
   - `assertNoTripwire(result)` — fail-closed after `agent.generate()` (`result.tripwire` + `finishReason === 'other'`)
   - `handleStreamChunk(chunk)` — detects `chunk.type === 'tripwire'`
   - `assertNoTripwireInStream(fullStream)` — consumes stream, throws on first tripwire
   - `TripwireError` — structured error with `{ reason, processorId, retry?, metadata? }`

2. **`services/platform/src/compat/cells/agent.ts`** — sole production `agent.generate()` call site:
   - calls `assertNoTripwire(result)` after generate
   - returns `ok: false` + `tripwire` fields when blocked (never treats blocked as success)

3. **`services/platform/src/mastra/__tests__/tripwire.test.ts`** — pure-logic tests (8 pass)

## Grep evidence

See `tripwire-evidence.txt`.

- `result.tripwire` hits: ≥1 (helper + docs + generate site comment path)
- stream `chunk.type === 'tripwire'` hits: ≥1 (`handleStreamChunk`)

## AC mapping

| AC | Status | Evidence |
|----|--------|----------|
| AC-FIX-1: generate tripwire at call site | pass | agent.ts → assertNoTripwire(result) after generate |
| AC-FIX-2: stream tripwire handler | pass | handleStreamChunk / assertNoTripwireInStream + tests |
