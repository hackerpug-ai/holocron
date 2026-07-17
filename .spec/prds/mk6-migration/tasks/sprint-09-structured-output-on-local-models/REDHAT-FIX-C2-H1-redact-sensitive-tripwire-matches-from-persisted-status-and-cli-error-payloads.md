# REDHAT-FIX-C2-H1 — Redact sensitive tripwire matches from persisted status and CLI error payloads

## What this does

Close red-hat cycle-2 H1 (**CRITICAL**): the tripwire control — whose entire purpose is to prevent sensitive data (SSNs, credit-card numbers, API keys, passwords) from flowing onward — currently echoes the literal matched strings back into the persisted `BlockedError` payload (`.tmp/extractions/<id>.json`, written at `extract-structured.ts:198-207`) and the `holo extract` CLI stderr echo (`holo.ts:1858-1862` via `tripwirePayload`). The cycle-1 gate log `step6-tripwire.log` proves it in the wild: `"details":"...input: 123-45-6789"`, `"patterns":["123-45-6789"]`. A data-loss-prevention control that records the data it caught is a design defect regardless of the single-user tailnet trust boundary.

The fix replaces the raw-match serialization at both BlockedError construction sites (input `:366-367` and output `:438-439`) with a **count + pattern-kind label** (e.g. `'SSN'`, `'CREDIT_CARD'`, `'API_KEY'`, `'PASSWORD'`) derived from a parallel `PATTERN_KINDS` array over `TRIPWIRE_PATTERNS` (`:252-263`). The detection itself stays functional (the regex still matches `123-45-6789`); only the SERIALIZED payload is redacted. The never-silently-accept invariant and the block invariant (`status==='blocked'`, `committed===false`) are preserved.

Provides: a `PATTERN_KINDS` label array parallel to `TRIPWIRE_PATTERNS`; redacted `BlockedError` payloads at both tripwire sites; zero raw SSN/CC/api-key/password literals in any persisted status file or CLI error output for a tripwire case.

## Why

- MUST replace `inputTripwire.matches.slice(0, 3).join(', ')` and `inputTripwire.matches.slice(0, 5)` at `extract-structured.ts:366-367` with a count + pattern-kind label derived from the `TRIPWIRE_PATTERNS` index (e.g. `'SSN'`, `'CREDIT_CARD'`)
- MUST replace `outputTripwire.matches.slice(0, 3).join(', ')` and `outputTripwire.matches.slice(0, 5)` at `extract-structured.ts:438-439` with the same redaction scheme
- MUST map each `TRIPWIRE_PATTERNS` entry (`:252-263`) to a stable pattern-kind label so the `BlockedError` payload carries kind labels, never raw matched strings
- MUST preserve the never-silently-accept invariant — redaction changes the payload shape but the `BlockedError` is still thrown, status is still `'blocked'`, `committed` is still `false`
- MUST keep the tripwire detection itself functional — `findTripwireMatches` still matches raw text internally; only the SERIALIZED payload is redacted
- MUST Write RED evidence showing the current `matches.slice(...)` payload shape (e.g. by grepping the pre-fix source or the cycle-1 `step6-tripwire.log`), then GREEN showing only kind labels + counts
- NEVER serialize the raw capture group (`inputTripwire.matches[i]` / `outputTripwire.matches[i]`) into `tripwirePayload.details`, `tripwirePayload.patterns`, `writeExtractionStatus`, or console output
- NEVER weaken or remove the tripwire regexes to "fix" the leak — the detection must still fire on `123-45-6789`
- STRICTLY run against the real fleet at `127.0.0.1:4545` — no mock models, no `endpointOverride`
- STRICTLY `PLATFORM_IT=1` for the integration verification; the absence-of-raw-literal grep is the load-bearing evidence
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h1*` showing pre-fix raw-echo payload and post-fix redacted payload
- Grounded in: UC-INFER-03, T-INFER-010, CAP-INF-01

## How to verify

- `rg -n 'matches\.slice|matches\.join' services/platform/src/inference/extract-structured.ts` → empty (exit 1)
- `rg -n 'PATTERN_KINDS|patternKind' services/platform/src/inference/extract-structured.ts` → ≥1 line
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0 (detection still fires, block invariant holds)
- `rg -rn '123-45-6789|4111-1111-1111-1111' .tmp/extractions/` → empty (exit 1) after a real tripwire run
- `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture tripwire --json 2>&1 | rg -c '123-45-6789'` → 0 (exit 1 from `rg`)
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check services/platform/src/inference/extract-structured.ts services/platform/src/cli/holo.ts` → Exit 0

## Scope

Writes: services/platform/src/inference/extract-structured.ts (MODIFY — redact input-tripwire payload at `:366-367` and output-tripwire payload at `:438-439`; add a `PATTERN_KINDS` label map over `TRIPWIRE_PATTERNS` at `:252-263`) · tests/integration/service/struct-tripwire-blocked.test.ts (MODIFY — assert the persisted status / `BlockedError` payload carries kind labels, not raw literals) · .tmp/redhat-fix-c2-h1*/** (NEW — RED+GREEN evidence)

Prohibited: services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C2-H1 — Redact sensitive tripwire matches from persisted status and CLI error payloads
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-implementer (red-hat cycle-2 review H1)
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Both BlockedError construction sites (input tripwire at `extract-structured.ts:363-368` and output tripwire at `:435-440`) serialize a COUNT plus a pattern-KIND label (e.g. `'SSN'`, `'CREDIT_CARD'`, `'API_KEY'`, `'PASSWORD'`) instead of the raw capture group, so the control that exists to prevent sensitive data from flowing onward no longer records that same sensitive data into the persisted `.tmp/extractions/<id>.json` status file (written at `:198-207`) or the `holo extract` CLI stderr payload (echoed at `holo.ts:1858-1862` via `tripwirePayload`). The literal fixture values `'123-45-6789'` and `'4111-1111-1111-1111'` never appear in any status file or CLI error output for a tripwire case.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST replace `inputTripwire.matches.slice(0, 3).join(', ')` and `inputTripwire.matches.slice(0, 5)` at `extract-structured.ts:366-367` with a count + pattern-kind label derived from the `TRIPWIRE_PATTERNS` index (e.g. `'SSN'`, `'CREDIT_CARD'`)
- MUST replace `outputTripwire.matches.slice(0, 3).join(', ')` and `outputTripwire.matches.slice(0, 5)` at `extract-structured.ts:438-439` with the same redaction scheme
- MUST map each `TRIPWIRE_PATTERNS` entry (`:252-263`) to a stable pattern-kind label so the `BlockedError` payload carries kind labels, never raw matched strings
- MUST preserve the never-silently-accept invariant — redaction changes the payload shape but the `BlockedError` is still thrown, status is still `'blocked'`, `committed` is still `false`
- MUST keep the tripwire detection itself functional — `findTripwireMatches` still matches raw text internally; only the SERIALIZED payload is redacted
- MUST Write RED evidence showing the current `matches.slice(...)` payload shape (pre-fix source / cycle-1 `step6-tripwire.log`), then GREEN showing only kind labels + counts
- NEVER serialize the raw capture group (`inputTripwire.matches[i]` / `outputTripwire.matches[i]`) into `tripwirePayload.details`, `tripwirePayload.patterns`, `writeExtractionStatus`, or console output
- NEVER weaken or remove the tripwire regexes to "fix" the leak — the detection must still fire on `123-45-6789`
- STRICTLY run against the real fleet at `127.0.0.1:4545` — no mock models, no `endpointOverride`
- STRICTLY `PLATFORM_IT=1` for the integration verification; the absence-of-raw-literal grep is the load-bearing evidence
- STRICTLY RED evidence under `.tmp/redhat-fix-c2-h1*`

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: zero `matches.slice` / `matches.join` calls remain in `extract-structured.ts`; a `PATTERN_KINDS` (or equivalent) label array maps each `TRIPWIRE_PATTERNS` entry to a kind (flow_ref T-INFER-010)
- [ ] AC-2: persisted `.tmp/extractions/<id>.json` for a real tripwire extraction contains no raw SSN/CC/api-key/password literal — only kind labels and a count (flow_ref T-INFER-010)
- [ ] AC-3: `holo extract --fixture tripwire --json` stderr payload shows kind labels or a `'redacted'` marker, never the raw matched value (flow_ref T-INFER-010)
- [ ] AC-4: grepping all emission surfaces (persisted status dir + gate-evidence tripwire log + CLI stderr) for the literal `123-45-6789` returns zero matches outside the fixture source files (flow_ref T-INFER-010)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 zero raw-match serialization remains in extract-structured.ts BlockedError sites (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: the two BlockedError construction sites in extract-structured.ts (input tripwire :363-368 and output tripwire :435-440)
  WHEN:  grepping the file for raw-match serialization patterns
  THEN:  zero matches for `matches.slice` / `matches.join` remain — the payload is assembled from a count + pattern-kind label only
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h1-input-tripwire-site · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the implementation leaves `inputTripwire.matches.slice(0, 5)` at line 367 unchanged (the H1 defect), the implementation leaves `outputTripwire.matches.slice(0, 3).join` at line 438 unchanged, a stub redaction passes the raw value through under a different key name, the BlockedError payload is empty (detection removed entirely to "fix" the leak)
    CASE[0] start_ref=c2-h1-input-tripwire-site · actor=reviewer
      ACTION: Grep extract-structured.ts for 'matches.slice' and 'matches.join' → Confirm both the input-tripwire (:366-367) and output-tripwire (:438-439) sites are gone → Grep for a pattern-kind labeling helper (e.g. PATTERN_KINDS or a kind-for-index map over TRIPWIRE_PATTERNS at :252-263)
      MUST_OBSERVE: `rg 'matches\.slice|matches\.join' services/platform/src/inference/extract-structured.ts` returns zero lines (exit 1) | a pattern-kind label array or mapping exists so each TRIPWIRE_PATTERNS entry resolves to 'SSN' | 'CREDIT_CARD' | 'API_KEY' | 'PASSWORD' | BlockedError at :363 still throws with reason 'sensitive_data_detected' and processorId 'pii-filter' | BlockedError at :435 still throws with reason 'output_sensitive_data_detected'
      MUST_NOT_OBSERVE: any line containing 'matches.slice(' or 'matches.join(' in extract-structured.ts (the pre-fix echo state) | the tripwire regexes removed or weakened to avoid the leak

AC-2 persisted blocked-status JSON contains no raw SSN/CC literal after a real tripwire run (flow_ref T-INFER-010)
  GIVEN: a real tripwire extraction run against the local fleet
  WHEN:  the BlockedError is persisted to .tmp/extractions/<id>.json (via writeExtractionStatus at :198-207)
  THEN:  the status file contains NO raw SSN/CC/password/api-key literal — only pattern-kind labels and a count
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h1-tripwire-input-fixture · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the persisted blocked status still carries `patterns: ['123-45-6789']` (the H1 wild-state proven by step6-tripwire.log), the status file is not written (writeExtractionStatus removed), the tripwire is stubbed to never fire so no blocked status exists, the fixture input is changed to remove the SSN (hiding the leak instead of redacting)
    CASE[0] start_ref=c2-h1-tripwire-input-fixture · actor=fleet
      ACTION: Run struct-tripwire-blocked.test.ts against the real fleet (input tripwire fires on 'My SSN is 123-45-6789...') → Read the persisted .tmp/extractions/<id>.json for the blocked extraction → Grep the entire .tmp/extractions/ directory for the raw literals '123-45-6789' and '4111-1111-1111-1111'
      MUST_OBSERVE: struct-tripwire-blocked.test.ts exits 0 (BlockedError still thrown, status==='blocked', committed===false) | status.blockedReason === 'sensitive_data_detected' (detection intact) | the status JSON contains a pattern-kind label such as 'SSN' and a numeric count | rg for '123-45-6789' across .tmp/extractions/ returns zero lines
      MUST_NOT_OBSERVE: the literal string '123-45-6789' anywhere in .tmp/extractions/<id>.json (the pre-fix persisted-echo state) | the literal string '4111-1111-1111-1111' anywhere in .tmp/extractions/ | status.committed === true (block invariant must hold)

AC-3 holo extract CLI stderr payload shows kind labels, not raw matches (flow_ref T-INFER-010)
  GIVEN: the holo extract CLI failure path (holo.ts:1842-1864)
  WHEN:  a BlockedError is echoed to stderr as the tripwirePayload JSON
  THEN:  the emitted payload shows pattern-kind labels or a 'redacted' marker, never the raw matched value
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h1-cli-echo-site · evidence: stdout
    NEGATIVE_CONTROL: would fail if holo.ts:1858-1862 still echoes `tripwirePayload: err.tripwirePayload` unchanged (raw values pass through), the CLI catches BlockedError but prints err.message which embeds the raw matches, the --fixture tripwire entry point is removed so the path cannot be exercised, the payload is stubbed to an empty object hiding whether redaction occurred
    CASE[0] start_ref=c2-h1-cli-echo-site · actor=fleet
      ACTION: Run 'holo extract --fixture tripwire --json' against the real fleet (input contains 'My SSN is 123-45-6789') → Capture the stderr JSON payload → Grep the emitted payload for '123-45-6789'
      MUST_OBSERVE: the stderr JSON contains "error":"BLOCKED" and "reason":"sensitive_data_detected" | the stderr JSON tripwirePayload.patterns is an array of kind labels (e.g. ["SSN"]) or tripwirePayload.details contains '(redacted)' | rg -c '123-45-6789' on the stderr output returns 0 (exit 1 from rg)
      MUST_NOT_OBSERVE: the literal '123-45-6789' in the stderr JSON (the pre-fix step6-tripwire.log state: \"patterns\":[\"123-45-6789\"]) | the CLI exiting 0 (BlockedError must still produce exit 1)

AC-4 zero raw '123-45-6789' across all emission surfaces outside fixture source files (flow_ref T-INFER-010)
  GIVEN: the full tripwire round-trip (input fixture '123-45-6789' → BlockedError → persist + CLI echo)
  WHEN:  grepping all emission surfaces (persisted status dir + gate-evidence tripwire log + CLI stderr) for the literal '123-45-6789'
  THEN:  zero matches — the fixture value enters the process, triggers detection, but never leaves it in raw form
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: c2-h1-persist-site · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if any output surface (status JSON, CLI stderr, gate-evidence log) still contains the raw '123-45-6789' literal, only the input tripwire is redacted but the output tripwire payload (:438-439) still leaks, the redaction is applied only to .patterns but .details still embeds the raw match via the template string, a new echo path is introduced that bypasses the redaction helper
    CASE[0] start_ref=c2-h1-persist-site · actor=reviewer
      ACTION: Run the tripwire fixture end-to-end to regenerate status + gate evidence → Grep .tmp/extractions/ and .gate-evidence/ for '123-45-6789', excluding source-fixture definitions → Confirm the literal appears ONLY in fixture definitions (struct-fixtures.ts / extract-fixtures), never in emitted output
      MUST_OBSERVE: `rg '123-45-6789'` over .tmp/extractions/ + .gate-evidence/ returns zero lines after excluding fixture-source files | the only remaining occurrences of '123-45-6789' in the repo are in tests/fixtures/struct-fixtures.ts and services/platform/src/cli/extract-fixtures.ts (the seed)
      MUST_NOT_OBSERVE: '123-45-6789' in any .tmp/extractions/*.json (the pre-fix persisted state) | '123-45-6789' in any .gate-evidence step6-tripwire.log (the proven wild state)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [No raw-match serialization remains in extract-structured.ts BlockedError sites] (maps_to_ac AC-1)
- TC-2 [Persisted blocked-status JSON contains no raw SSN/CC literal after a real tripwire run] (maps_to_ac AC-2)
- TC-3 [holo extract --fixture tripwire CLI stderr payload shows kind labels, not raw matches] (maps_to_ac AC-3)
- TC-4 [Typecheck + lint clean after the redaction refactor] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/extract-structured.ts (MODIFY — redact input-tripwire payload at :366-367 and output-tripwire payload at :438-439; add a PATTERN_KINDS label map over TRIPWIRE_PATTERNS at :252-263)
- tests/integration/service/struct-tripwire-blocked.test.ts (MODIFY — assert the persisted status / BlockedError payload carries kind labels, not raw literals)
- .tmp/redhat-fix-c2-h1*/** (NEW evidence)
writeProhibited: services/platform/src/inference/resolve-model.ts · services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 252-273
   - focus: TRIPWIRE_PATTERNS array and findTripwireMatches — the pattern index that must map to kind labels (SSN, CREDIT_CARD, API_KEY, PASSWORD)
2. services/platform/src/inference/extract-structured.ts lines 361-369
   - focus: INPUT-side BlockedError — the two lines (366-367) that slice raw matches into details + patterns
3. services/platform/src/inference/extract-structured.ts lines 428-441
   - focus: OUTPUT-side BlockedError — the two lines (438-439) that slice raw matches into details + patterns
4. services/platform/src/inference/extract-structured.ts lines 197-207
   - focus: writeExtractionStatus blocked-case — where the raw-leaking payload is persisted to .tmp/extractions/<id>.json
5. services/platform/src/cli/holo.ts lines 1842-1864
   - focus: CLI failure JSON — `tripwirePayload: err.tripwirePayload` echoes the raw-leaking payload to stderr
6. tests/integration/service/struct-tripwire-blocked.test.ts lines 89-166
   - focus: Existing tripwire test — the assertion surface to extend with kind-label + no-raw-literal checks
7. tests/fixtures/struct-fixtures.ts lines 156-178
   - focus: tripwireSchema + tripwireInput + tripwirePayload fixtures — the seed values (123-45-6789, 4111-1111-1111-1111) that must not leak

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- No raw-match serialization: `rg -n 'matches\.slice|matches\.join' services/platform/src/inference/extract-structured.ts` → empty (exit 1)
- Tripwire tests still pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0
- No raw literal in persisted status: `rg -rn '123-45-6789|4111-1111-1111-1111' .tmp/extractions/` → empty (exit 1)
- No raw literal in CLI stderr: `PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture tripwire --json 2>&1 | rg -c '123-45-6789'` → 0 (exit 1 from rg)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/src/inference/extract-structured.ts services/platform/src/cli/holo.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Count + pattern-kind labeling — derive a `PATTERN_KINDS = ['SSN','SSN','CREDIT_CARD','API_KEY','API_KEY','PASSWORD']` array parallel to `TRIPWIRE_PATTERNS`, so `findTripwireMatches` returns `{patternIndex, matches}` and the BlockedError payload serializes `{ count: matches.length, kinds: [PATTERN_KINDS[patternIndex]], details: \`Detected ${matches.length} sensitive data pattern(s) of kind ${kind} (values redacted)\` }`. The raw `matches[]` stays in memory for detection but is never serialized.
- pattern_source: `extract-structured.ts:252-273` (TRIPWIRE_PATTERNS) + `:365-368` (current raw payload) + Mastra PIIDetector `redactionMethod:'mask'|'placeholder'` concept
- anti_pattern: Hashing or truncating the raw value (e.g. `'123-...-6789'`) — partial redaction is still a leak vector; only kind-label serialization is safe. Also anti-pattern: removing/weakening the regex to "avoid" matching (defeats the control).
- agent_rationale: H1 is CRITICAL because the control's purpose (prevent sensitive data flow) is inverted by the payload (records the sensitive data). The minimal fix is at the serialization seam: `findTripwireMatches` already returns the matches internally for the detection decision; only the BlockedError constructor arguments change. Keeping the regexes and the throw intact preserves the never-silently-accept + block invariants (`status==='blocked'`, `committed===false`) while closing the leak. A parallel `PATTERN_KINDS` array is the smallest blast-radius change — no new abstraction, no detection-logic change.
- REDHAT-FIX-C2-H2 (output-tripwire coverage) depends on this — the output-tripwire payload site at `:438-439` is one of the two redaction targets.

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H3 (output-tripwire block exists at :428-441) · REDHAT-FIX-H6 (no-dispatch status store exists)
Blocks: REDHAT-FIX-C2-H2

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C2-H1",
  "proposed_by": "mastra-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "c2-h1-input-tripwire-site": {
      "description": "The INPUT-side BlockedError construction at extract-structured.ts:363-368 that currently serializes raw matches",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:365 reason: 'sensitive_data_detected', processorId: 'pii-filter'",
        "extract-structured.ts:366 details: `Detected ${inputTripwire.matches.length} sensitive data pattern(s) in input: ${inputTripwire.matches.slice(0, 3).join(', ')}`",
        "extract-structured.ts:367 patterns: inputTripwire.matches.slice(0, 5) — the raw matched values (SSN/CC/api-key strings)"
      ]
    },
    "c2-h1-output-tripwire-site": {
      "description": "The OUTPUT-side BlockedError construction at extract-structured.ts:435-440 that currently serializes raw model-synthesized matches",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:436 reason: 'output_sensitive_data_detected', processorId: 'pii-filter'",
        "extract-structured.ts:438 details: `Detected ${outputTripwire.matches.length} sensitive data pattern(s) in model output: ${outputTripwire.matches.slice(0, 3).join(', ')}`",
        "extract-structured.ts:439 patterns: outputTripwire.matches.slice(0, 5) — raw matched values from JSON.stringify(object)"
      ]
    },
    "c2-h1-persist-site": {
      "description": "The writeExtractionStatus blocked-case at extract-structured.ts:197-207 that persists the raw-leaking BlockedError fields to disk",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts:198-207 writeExtractionStatus({ id, status:'blocked', committed:false, blockedReason: err.reason, processorId: err.processorId })",
        "EXTRACTIONS_DIR = .tmp/extractions/ (gitignored, line 128)",
        "gate evidence step6-tripwire.log proves the wild leak: \"details\":\"...input: 123-45-6789\", \"patterns\":[\"123-45-6789\"]"
      ]
    },
    "c2-h1-cli-echo-site": {
      "description": "The holo extract CLI failure path at holo.ts:1842-1864 that echoes tripwirePayload to stderr",
      "seed_method": "public_api",
      "records": [
        "holo.ts:1858-1862 ...(err instanceof BlockedError && { reason: err.reason, processorId: err.processorId, tripwirePayload: err.tripwirePayload })",
        "the tripwirePayload object carries the same raw-leaking details + patterns from the BlockedError constructor",
        "emitted via console.error(JSON.stringify(...)) to stderr"
      ]
    },
    "c2-h1-tripwire-input-fixture": {
      "description": "The tripwireInput fixture (tests/fixtures/struct-fixtures.ts:166-169) carrying the literal SSN + CC that must trigger detection but never appear in output",
      "seed_method": "public_api",
      "records": [
        "tripwireInput = 'Analyze the sentiment of this text: \"My SSN is 123-45-6789 and my credit card is 4111-1111-1111-1111\"'",
        "tripwireSchema = z.object({ summary: z.string(), sentiment: z.string() })",
        "TRIPWIRE_PATTERNS[0] = /\\b\\d{3}-\\d{2}-\\d{4}\\b/g matches '123-45-6789' (kind = SSN)",
        "TRIPWIRE_PATTERNS[2] = /\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b/g matches '4111-1111-1111-1111' (kind = CREDIT_CARD)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the two BlockedError construction sites in extract-structured.ts (input tripwire :363-368 and output tripwire :435-440) WHEN grepping the file for raw-match serialization patterns THEN zero matches for matches.slice / matches.join remain — the payload is assembled from a count + pattern-kind label only",
      "verify": "rg -n 'matches\\.slice|matches\\.join' services/platform/src/inference/extract-structured.ts; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the implementation leaves inputTripwire.matches.slice(0, 5) at line 367 unchanged (the H1 defect)",
            "the implementation leaves outputTripwire.matches.slice(0, 3).join at line 438 unchanged",
            "a stub redaction that passes the raw value through under a different key name",
            "the BlockedError payload is empty (detection removed entirely to 'fix' the leak)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h1-input-tripwire-site",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Grep extract-structured.ts for 'matches.slice' and 'matches.join'",
                "Confirm both the input-tripwire (:366-367) and output-tripwire (:438-439) sites are gone",
                "Grep for a pattern-kind labeling helper (e.g. PATTERN_KINDS or a kind-for-index map over TRIPWIRE_PATTERNS at :252-263)"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg 'matches\\.slice|matches\\.join' services/platform/src/inference/extract-structured.ts returns zero lines (exit 1)",
                "a pattern-kind label array or mapping exists so each TRIPWIRE_PATTERNS entry resolves to 'SSN' | 'CREDIT_CARD' | 'API_KEY' | 'PASSWORD'",
                "BlockedError at :363 still throws with reason 'sensitive_data_detected' and processorId 'pii-filter'",
                "BlockedError at :435 still throws with reason 'output_sensitive_data_detected'"
              ],
              "must_not_observe": [
                "any line containing 'matches.slice(' or 'matches.join(' in extract-structured.ts (the pre-fix echo state)",
                "the tripwire regexes removed or weakened to avoid the leak"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a real tripwire extraction run against the local fleet WHEN the BlockedError is persisted to .tmp/extractions/<id>.json (via writeExtractionStatus at :198-207) THEN the status file contains NO raw SSN/CC/password/api-key literal — only pattern-kind labels and a count",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts && rg -n '123-45-6789|4111-1111-1111-1111|sk-[a-zA-Z0-9]{20}' .tmp/extractions/; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "the persisted blocked status still carries patterns: ['123-45-6789'] (the H1 wild-state proven by step6-tripwire.log)",
            "the status file is not written (writeExtractionStatus removed)",
            "the tripwire is stubbed to never fire so no blocked status exists",
            "the fixture input is changed to remove the SSN (hiding the leak instead of redacting)"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h1-tripwire-input-fixture",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run struct-tripwire-blocked.test.ts against the real fleet (input tripwire fires on 'My SSN is 123-45-6789...')",
                "Read the persisted .tmp/extractions/<id>.json for the blocked extraction",
                "Grep the entire .tmp/extractions/ directory for the raw literals '123-45-6789' and '4111-1111-1111-1111'"
              ]
            },
            "end_state": {
              "must_observe": [
                "struct-tripwire-blocked.test.ts exits 0 (BlockedError still thrown, status==='blocked', committed===false)",
                "status.blockedReason === 'sensitive_data_detected' (detection intact)",
                "the status JSON contains a pattern-kind label such as 'SSN' and a numeric count",
                "rg for '123-45-6789' across .tmp/extractions/ returns zero lines"
              ],
              "must_not_observe": [
                "the literal string '123-45-6789' anywhere in .tmp/extractions/<id>.json (the pre-fix persisted-echo state)",
                "the literal string '4111-1111-1111-1111' anywhere in .tmp/extractions/",
                "status.committed === true (block invariant must hold)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the holo extract CLI failure path (holo.ts:1842-1864) WHEN a BlockedError is echoed to stderr as the tripwirePayload JSON THEN the emitted payload shows pattern-kind labels or a 'redacted' marker, never the raw matched value",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-fixture-cli.test.ts && bun services/platform/src/cli/holo.ts extract --fixture tripwire --json 2>&1 | rg -c '123-45-6789'; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "holo.ts:1858-1862 still echoes tripwirePayload: err.tripwirePayload unchanged (raw values pass through)",
            "the CLI catches BlockedError but prints err.message which embeds the raw matches",
            "the --fixture tripwire entry point is removed so the path cannot be exercised",
            "the payload is stubbed to an empty object hiding whether redaction occurred"
          ]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h1-cli-echo-site",
            "action": {
              "actor": "fleet",
              "steps": [
                "Run 'holo extract --fixture tripwire --json' against the real fleet (input contains 'My SSN is 123-45-6789')",
                "Capture the stderr JSON payload",
                "Grep the emitted payload for '123-45-6789'"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stderr JSON contains \"error\":\"BLOCKED\" and \"reason\":\"sensitive_data_detected\"",
                "the stderr JSON tripwirePayload.patterns is an array of kind labels (e.g. [\"SSN\"]) or tripwirePayload.details contains '(redacted)'",
                "rg -c '123-45-6789' on the stderr output returns 0 (exit 1 from rg)"
              ],
              "must_not_observe": [
                "the literal '123-45-6789' in the stderr JSON (the pre-fix step6-tripwire.log state: \\\"patterns\\\":[\\\"123-45-6789\\\"])",
                "the CLI exiting 0 (BlockedError must still produce exit 1)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the full tripwire round-trip (input fixture '123-45-6789' → BlockedError → persist + CLI echo) WHEN grepping all emission surfaces (persisted status dir + gate-evidence tripwire log + CLI stderr) for the literal '123-45-6789' THEN zero matches — the fixture value enters the process, triggers detection, but never leaves it in raw form",
      "verify": "rg -rn '123-45-6789' .tmp/extractions/ .gate-evidence/ 2>/dev/null | rg -v 'struct-fixtures|extract-fixtures|tripwireInput|input text'; test $? -eq 1",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": [
            "any output surface (status JSON, CLI stderr, gate-evidence log) still contains the raw '123-45-6789' literal",
            "only the input tripwire is redacted but the output tripwire payload (:438-439) still leaks",
            "the redaction is applied only to .patterns but .details still embeds the raw match via the template string",
            "a new echo path is introduced that bypasses the redaction helper"
          ]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "c2-h1-persist-site",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Run the tripwire fixture end-to-end to regenerate status + gate evidence",
                "Grep .tmp/extractions/ and .gate-evidence/ for '123-45-6789', excluding source-fixture definitions",
                "Confirm the literal appears ONLY in fixture definitions (struct-fixtures.ts / extract-fixtures), never in emitted output"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg '123-45-6789' over .tmp/extractions/ + .gate-evidence/ returns zero lines after excluding fixture-source files",
                "the only remaining occurrences of '123-45-6789' in the repo are in tests/fixtures/struct-fixtures.ts and services/platform/src/cli/extract-fixtures.ts (the seed)"
              ],
              "must_not_observe": [
                "'123-45-6789' in any .tmp/extractions/*.json (the pre-fix persisted state)",
                "'123-45-6789' in any .gate-evidence step6-tripwire.log (the proven wild state)"
              ]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "No raw-match serialization remains in extract-structured.ts BlockedError sites", "verify": "rg -n 'matches\\.slice|matches\\.join' services/platform/src/inference/extract-structured.ts; test $? -eq 1", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "Persisted blocked-status JSON contains no raw SSN/CC literal after a real tripwire run", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts && rg -n '123-45-6789' .tmp/extractions/; test $? -eq 1", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "holo extract --fixture tripwire CLI stderr payload shows kind labels, not raw matches", "verify": "PLATFORM_IT=1 bun services/platform/src/cli/holo.ts extract --fixture tripwire --json 2>&1 | rg -c '123-45-6789'; test $? -eq 1", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "Typecheck + lint clean after the redaction refactor", "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/inference/extract-structured.ts services/platform/src/cli/holo.ts", "maps_to_ac": "AC-1" }
  ]
}
-->
</details>
