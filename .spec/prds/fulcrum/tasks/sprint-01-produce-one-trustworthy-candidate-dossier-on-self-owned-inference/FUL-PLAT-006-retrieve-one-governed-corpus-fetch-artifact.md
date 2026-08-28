# FUL-PLAT-006 — Retrieve one governed corpus fetch artifact

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** C
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Replace snippet-shaped retrieval for the Fulcrum instantiation with a governed corpus fetch that persists a real fetch artifact, honours the contract's source governance, records the executed query, and refuses canned claims.

## Why

`holo fulcrum '<goal>' --fresh --json` against a real ingested corpus writes 1 sources row with an 1800-character normalized_text and a 64-character content_hash; a banned-domain hit is dropped with reason domain_banned; `--claims` returns errorCode FULCRUM_CORPUS_ONLY with 0 candidates; a foreign 280-character snippet quote fails verification against the stored artifact.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'
```

Full gate set: 5 acceptance criteria, 10 test criteria, 4 verification gates.

## Scope

- services/platform/src/fulcrum/retrieval.ts (NEW)
- services/platform/src/mission/runtime.ts (MODIFY — the builtin.research-retrieve@1 executor's fulcrum branch only)
- services/platform/tests/integration/fulcrum-corpus-fetch.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-006 - Retrieve one governed corpus fetch artifact
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave C)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

`holo fulcrum '<goal>' --fresh --json` against a real ingested corpus writes 1 sources row with an 1800-character normalized_text and a 64-character content_hash; a banned-domain hit is dropped with reason domain_banned; `--claims` returns errorCode FULCRUM_CORPUS_ONLY with 0 candidates; a foreign 280-character snippet quote fails verification against the stored artifact.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST persist the FetchArtifact { url, fetchedAt, raw, normalizedText, contentHash } onto `sources` before any claim references it
- MUST: MUST read the ban-list and courtesyDelayMs from the compiled contract persisted by FUL-PLAT-005 — never from a hardcoded list
- MUST: MUST fail closed on an empty corpus with the existing MISSION_RETRIEVE_EMPTY code rather than soft-succeeding with 0 hits
- NEVER: NEVER set normalized_text from the RRF `sourceText` snippet or any `slice(0, 280)` buffer — that is the exact anti-pattern at services/platform/src/mission/runtime.ts:342-398
- NEVER: NEVER honour args.researchEvidence for instantiation `fulcrum`; refuse with FULCRUM_CORPUS_ONLY
- NEVER: NEVER call an outbound web tool — SENSE is corpus-only against documents / passages / prior sources
- STRICTLY: STRICTLY scoped to the `fulcrum` instantiation — the research / deepResearch / subscriptions-research aliases keep the existing retrieve behaviour, and the full integration lane must stay green to prove it

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-EVIDENCE-01, CAP-COMMIT-01
provides:             fetch-artifact-row, executed-query-record, corpus-only-enforcement, governed-retrieval-client
consumes:             fulcrum-mission-contract-version, source-governance-policy, fulcrum-tool-grants, sources-fetch-artifact-columns
boundary_contracts:
  - Every retrieval writes a sources row carrying url, retrieved_at, source_domain, content_hash and the full normalized_text — never a truncated hybrid-search snippet
  - A corpus hit whose source_domain is on the mission contract's ban-list is dropped before the gate, and the drop is recorded with reason domain_banned
  - `holo fulcrum --claims <file>` is refused with errorCode FULCRUM_CORPUS_ONLY and writes no candidate and no fetch artifact
  - The executed query is recorded so a later cycle does not repeat a near-duplicate retrieval

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): One corpus retrieval persists a real fetch artifact on sources
- [ ] AC-2: A banned-domain corpus hit is dropped before the gate
- [ ] AC-3: A canned claims file is refused as corpus-only
- [ ] AC-4: The executed query is recorded so the next cycle does not repeat it
- [ ] AC-5: The artifact retains the full body, not the RRF snippet
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: One corpus retrieval persists a real fetch artifact on sources [PRIMARY]
  GIVEN: an ingested corpus holding 1 matching document of 1800 characters and 0 Fulcrum `sources` rows
  WHEN:  the operator runs `holo fulcrum '<goal>' --fresh --json` and SENSE executes one corpus retrieval
  THEN:  1 `sources` row is written carrying url, retrieved_at, a 64-character content_hash and the full normalized_text

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-CYC-04 AC-2
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
    NEGATIVE_CONTROL: would fail if the retrieval maps RRF hits straight into the gate payload and never writes a sources row; normalized_text is populated from the truncated hybrid-search sourceText snippet rather than the fetched body; the retrieval client is stubbed to return a canned hit list with no corpus query; the run succeeds against an empty corpus, proving nothing was retrieved
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: ingested_corpus_single_hit
        ACTOR:     cli_user
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`
        STEP:      SELECT url, retrieved_at, source_domain, content_hash, length(normalized_text) FROM sources WHERE retrieved_at IS NOT NULL
        MUST_OBSERVE:     `SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 1
        MUST_OBSERVE:     the written row reports `length(normalized_text)` = 1800
        MUST_OBSERVE:     the written row carries a 64-character `content_hash`
        MUST_OBSERVE:     the written row carries `source_domain` = 'sec.gov' and a non-null `url`
        MUST_NOT_OBSERVE: `SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 0
        MUST_NOT_OBSERVE: a `normalized_text` of 280 characters copied from the RRF snippet
        MUST_NOT_OBSERVE: `content_hash` is NULL or empty

AC-2: A banned-domain corpus hit is dropped before the gate
  GIVEN: an ingested corpus holding 2 matching documents, 1 of them on the banned domain 'contentfarm.example'
  WHEN:  the governed retrieval runs under the compiled `dev-revenue` contract
  THEN:  1 `sources` row is written for 'sec.gov' and the banned url appears nowhere in the run's artifacts

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-CYC-04 AC-4 (source governance)
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
    NEGATIVE_CONTROL: would fail if the ban-list is read but never applied, so the banned hit reaches the gate; the ban-list field is dropped during contract compilation, leaving the filter with an empty list; the filter drops every hit including the allowed one, so the run silently retrieves nothing; the drop reason is not recorded, making the filter unobservable
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: ingested_corpus_two_hits
        ACTOR:     cli_user
        STEP:      run the governed Fulcrum retrieval for the same goal under the compiled `dev-revenue` contract
        STEP:      SELECT source_domain, url FROM sources WHERE retrieved_at IS NOT NULL
        STEP:      read the run's retrieve stage output from `mission_stage_runs`
        MUST_OBSERVE:     `SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 1
        MUST_OBSERVE:     the written row carries `source_domain` = 'sec.gov'
        MUST_OBSERVE:     the retrieve stage output records 1 dropped hit with reason `domain_banned`
        MUST_NOT_OBSERVE: a `sources` row carrying `source_domain` = 'contentfarm.example'
        MUST_NOT_OBSERVE: `SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 2
        MUST_NOT_OBSERVE: `SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 0

AC-3: A canned claims file is refused as corpus-only
  GIVEN: an ingested corpus, 0 `candidates` rows, and /tmp/fulcrum-canned.json holding 1 fabricated claim
  WHEN:  the operator runs `holo fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json`
  THEN:  the response reports `errorCode` FULCRUM_CORPUS_ONLY and no candidate or fetch artifact is written

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
  FLOW_REF:             CAP-EVIDENCE-01 boundary: corpus-only SENSE
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
    NEGATIVE_CONTROL: would fail if the fulcrum instantiation keeps honouring args.researchEvidence, so a hand-written claims file becomes ledger content; the corpus-only check is a no-op so the run still writes a candidate first; the error is a generic MISSION_RUNTIME_FAILED with no named code the gate can assert
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: canned_claims_file
        ACTOR:     cli_user
        STEP:      write /tmp/fulcrum-canned.json containing [{"claim":"invented success"}]
        STEP:      run `bun services/platform/src/cli/holo.ts fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json`
        STEP:      parse the JSON response and SELECT count(*) FROM candidates
        MUST_OBSERVE:     the JSON response contains `"errorCode":"FULCRUM_CORPUS_ONLY"`
        MUST_OBSERVE:     the response contains no `candidateId` key
        MUST_OBSERVE:     `SELECT count(*) FROM candidates` returns 0 after the refusal
        MUST_OBSERVE:     the process exit code reads 1
        MUST_NOT_OBSERVE: the response contains a `candidateId`
        MUST_NOT_OBSERVE: the response contains a `dossierPath`
        MUST_NOT_OBSERVE: the claim text 'invented success' persisted to `claims`
        MUST_NOT_OBSERVE: no errorCode key present in the JSON response

AC-4: The executed query is recorded so the next cycle does not repeat it
  GIVEN: a corpus retrieval that already recorded 1 executed query for the candidate
  WHEN:  a second retrieval runs for the same candidate
  THEN:  2 distinct executed queries are recorded and the second is not a near-duplicate of the first

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-CYC-04 AC-1 + AC-5
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
    NEGATIVE_CONTROL: would fail if executed queries are never recorded, so every cycle re-runs the same retrieval; the dedupe check compares against a hardcoded list rather than the persisted history; the second run reuses the first run's cached result instead of retrieving
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: ingested_corpus_two_hits
        ACTOR:     cli_user
        STEP:      run the governed Fulcrum retrieval once for the candidate and read the recorded query
        STEP:      run the governed Fulcrum retrieval a second time for the same candidate
        STEP:      read the recorded executed queries from the candidate's retrieval history
        MUST_OBSERVE:     the retrieval history holds 2 recorded queries
        MUST_OBSERVE:     the 2 recorded query strings are distinct
        MUST_OBSERVE:     the second retrieval reports `repeatedQuery` = false
        MUST_NOT_OBSERVE: the retrieval history holds 0 recorded queries
        MUST_NOT_OBSERVE: the 2 recorded query strings are identical
        MUST_NOT_OBSERVE: the second retrieval reports `repeatedQuery` = true

AC-5: The artifact retains the full body, not the RRF snippet
  GIVEN: an ingested 1800-character document and its hybrid-search hit whose snippet buffer is 280 characters
  WHEN:  the fetch artifact is written and compared against the snippet
  THEN:  `normalized_text` holds 1800 characters and a quote taken from the 280-character snippet slice fails verification against it

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-CYC-04 AC-6 (fail closed on RRF-sliced quotes)
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-5'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)
    NEGATIVE_CONTROL: would fail if normalized_text is hardcoded from the RRF sourceText snippet, making every snippet-sliced quote vacuously verifiable; the artifact stores only the title, so normalized_text is far shorter than the fetched body; the raw body is discarded and normalized_text is reconstructed from the hit metadata
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: ingested_corpus_single_hit
        ACTOR:     api_client
        STEP:      run the governed Fulcrum retrieval and read the written `sources` row
        STEP:      read the corresponding hybrid-search hit snippet
        STEP:      verify a quote built from the first 280 characters of a DIFFERENT hit's snippet against the written `normalized_text`
        MUST_OBSERVE:     the written `normalized_text` reports length 1800
        MUST_OBSERVE:     the written `normalized_text` differs from the 280-character snippet
        MUST_OBSERVE:     verifying the foreign 280-character snippet quote against `normalized_text` returns false
        MUST_OBSERVE:     verifying a verbatim 60-character span of `normalized_text` returns true
        MUST_NOT_OBSERVE: the written `normalized_text` reports length 280
        MUST_NOT_OBSERVE: `normalized_text` is empty
        MUST_NOT_OBSERVE: verifying the foreign snippet quote returns true

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'` |
| TC-5 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'` |
| TC-6 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'` |
| TC-7 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'` |
| TC-8 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'` |
| TC-9 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-4'` |
| TC-10 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-5'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/fulcrum/retrieval.ts (NEW)
- services/platform/src/mission/runtime.ts (MODIFY — the builtin.research-retrieve@1 executor's fulcrum branch only)
- services/platform/tests/integration/fulcrum-corpus-fetch.test.ts (NEW)

writeProhibited:
- services/platform/src/fulcrum/gate/provenance.ts and provenance-writer.ts — owned by FUL-PLAT-003 (same wave)
- services/platform/src/fulcrum/contract.ts and missions/** — delivered by FUL-PLAT-005; consume, do not edit
- services/platform/src/mission/contract.ts and templates/** — owned by FUL-PLAT-005
- services/platform/src/cli/holo.ts — owned by FUL-PLAT-012; surface FULCRUM_CORPUS_ONLY as a MissionRuntimeError so the existing CLI error path prints it
- services/platform/src/db/** — owned by FUL-PLAT-001
- services/platform/src/research/** — the shipped on-demand research path stays untouched
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/mission/runtime.ts:866-940 (builtin.research-retrieve@1) + services/platform/src/research/provenance.ts (content hashing)

Instantiation-branched stage executor delegating to a governed client that (1) queries the corpus through registered tools, (2) filters by the contract's ban-list with a recorded reason, (3) writes the FetchArtifact to sources, (4) records the executed query.

ANTI-PATTERN: services/platform/src/mission/runtime.ts:342-398 — `quoteInSource = sourceText.slice(0, 280)` paired with `sourceText` as the verification body. Every quote is trivially a substring of the buffer it was cut from, so the anti-fabrication guard verifies nothing.

References:
- .spec/prds/fulcrum/05-uc-cyc.md § UC-CYC-04 — the fetch artifact contract and the fail-closed rule on RRF-sliced quotes
- services/platform/src/mission/runtime.ts:866-940 — the executor being branched

Notes:
- T
- h
- e
-  
- C
- L
- I
-  
- i
- s
-  
- d
- e
- l
- i
- b
- e
- r
- a
- t
- e
- l
- y
-  
- u
- n
- t
- o
- u
- c
- h
- e
- d
- .
-  
- `
- h
- o
- l
- o
-  
- f
- u
- l
- c
- r
- u
- m
- `
-  
- a
- l
- r
- e
- a
- d
- y
-  
- c
- a
- t
- c
- h
- e
- s
-  
- a
-  
- t
- h
- r
- o
- w
- n
-  
- e
- r
- r
- o
- r
-  
- a
- n
- d
-  
- p
- r
- i
- n
- t
- s
-  
- `
- p
- a
- y
- l
- o
- a
- d
- .
- e
- r
- r
- o
- r
- C
- o
- d
- e
- `
- ,
-  
- s
- o
-  
- r
- a
- i
- s
- i
- n
- g
-  
- a
-  
- M
- i
- s
- s
- i
- o
- n
- R
- u
- n
- t
- i
- m
- e
- E
- r
- r
- o
- r
- (
- '
- F
- U
- L
- C
- R
- U
- M
- _
- C
- O
- R
- P
- U
- S
- _
- O
- N
- L
- Y
- '
- ,
-  
- .
- .
- .
- )
-  
- f
- r
- o
- m
-  
- t
- h
- e
-  
- r
- u
- n
- t
- i
- m
- e
-  
- s
- u
- r
- f
- a
- c
- e
- s
-  
- t
- h
- e
-  
- e
- x
- a
- c
- t
-  
- l
- i
- t
- e
- r
- a
- l
-  
- t
- h
- e
-  
- s
- p
- r
- i
- n
- t
-  
- g
- a
- t
- e
-  
- g
- r
- e
- p
- s
-  
- f
- o
- r
-  
- w
- i
- t
- h
- o
- u
- t
-  
- c
- o
- n
- t
- e
- n
- d
- i
- n
- g
-  
- w
- i
- t
- h
-  
- F
- U
- L
- -
- P
- L
- A
- T
- -
- 0
- 1
- 2
-  
- o
- v
- e
- r
-  
- h
- o
- l
- o
- .
- t
- s
- .
-  
- T
- h
- e
-  
- r
- e
- t
- r
- i
- e
- v
- a
- l
-  
- c
- l
- i
- e
- n
- t
-  
- r
- e
- t
- u
- r
- n
- s
-  
- b
- o
- t
- h
-  
- t
- h
- e
-  
- a
- r
- t
- i
- f
- a
- c
- t
-  
- a
- n
- d
-  
- t
- h
- e
-  
- d
- r
- o
- p
-  
- l
- e
- d
- g
- e
- r
-  
- s
- o
-  
- t
- h
- e
-  
- r
- e
- t
- r
- i
- e
- v
- e
-  
- s
- t
- a
- g
- e
-  
- o
- u
- t
- p
- u
- t
-  
- m
- a
- k
- e
- s
-  
- g
- o
- v
- e
- r
- n
- a
- n
- c
- e
-  
- o
- b
- s
- e
- r
- v
- a
- b
- l
- e
-  
- i
- n
-  
- m
- i
- s
- s
- i
- o
- n
- _
- s
- t
- a
- g
- e
- _
- r
- u
- n
- s
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/mission/runtime.ts
   - Lines: 866-940
   - Focus: [PRIMARY PATTERN] the current builtin.research-retrieve@1 executor — seed path, rrfHybridSearch call, MISSION_RETRIEVAL_UNAVAILABLE / MISSION_RETRIEVE_EMPTY fail-closed codes. Fulcrum branches here.
2. services/platform/src/mission/runtime.ts
   - Lines: 342-398
   - Focus: mapRrfHitsToEvidenceGateInput — the `sourceText.slice(0, 280)` quote laundering this task must stop feeding the Fulcrum gate
3. services/platform/src/research/provenance.ts
   - Lines: 1-45
   - Focus: sha256Text and the fetch-provenance record shape — the content_hash derivation for the artifact
4. services/platform/src/fulcrum/contract.ts
   - Lines: whole file (delivered by FUL-PLAT-005)
   - Focus: banList / courtesyDelayMs / toolGrants fields this client enforces
5. services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts
   - Lines: 1-80
   - Focus: Closest existing integration test of the retrieve executor against a real corpus and a real embed role — env contract and corpus-seeding conventions

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

FOR EACH ACCEPTANCE CRITERION, in order:

  RED    — write ONE test exercising GIVEN-WHEN-THEN against the REAL service named in
           VERIFICATION_SERVICE. Run it. It must FAIL (fail, not error) against the
           start state. Capture the failure output. Write NO implementation code.
  GREEN  — write the MINIMAL code that turns that test green. Nothing beyond the AC.
  REFACTOR — improve without introducing new behavior. Tests stay green.

  The RED proof must be observed against the scenario's start state — a test that
  passes without the seeded behavior present is a FAIL, not a pass.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1: None
  Command:  pnpm test:integration
  Expected: None

Gate 2: None
  Command:  pnpm tsgo --noEmit
  Expected: None

Gate 3: None
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fulcrum/retrieval.ts services/platform/src/mission/runtime.ts services/platform/tests/integration/fulcrum-corpus-fetch.test.ts
  Expected: None

Gate 4: None
  Command:  pnpm test:live
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Rewrites the Mastra retrieve stage executor (services/platform/src/mission/runtime.ts) plus a new governed retrieval client, verified end-to-end against a real Postgres corpus and the real embed role — squarely the Mastra platform surface this triad owns.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- The retrieval client's input and output are declared Zod schemas — no z.any() on the artifact or the drop ledger
- Drop reasons are a closed string-literal union (domain_banned | duplicate_content_hash | below_relevance_floor), never a free-form message
- Error codes reuse MissionRuntimeError with named codes (FULCRUM_CORPUS_ONLY, MISSION_RETRIEVE_EMPTY, MISSION_RETRIEVAL_UNAVAILABLE) — never a bare Error
- content_hash is sha256 over normalizedText via services/platform/src/research/provenance.ts sha256Text — no second hashing implementation

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001, FUL-PLAT-005
Blocks:     FUL-PLAT-008, FUL-PLAT-012
Wave:       C

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
- RED evidence present for every AC before its GREEN
- PRIMARY AC scenario passes validate_scenario (exit 0), evidence artifact captured
- Minimal implementation; no gold-plating
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

================================================================================
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "FUL-PLAT-006",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "ingested_corpus_two_hits": {
      "description": "holocron_nonprod holding 2 ingested documents matching the goal text \u2014 1 under `source_domain` 'sec.gov' and 1 under the banned 'contentfarm.example' \u2014 each with real 1024-dim passage embeddings",
      "seed_method": "cli",
      "records": [
        "2 `documents` rows ingested through the real document-ingest CLI",
        "`passages` holds 1024-dimension embeddings for both documents",
        "`sources` holds 0 rows carrying a Fulcrum `retrieved_at` value",
        "the compiled `dev-revenue` contract bans 'contentfarm.example'"
      ]
    },
    "ingested_corpus_single_hit": {
      "description": "holocron_nonprod holding 1 ingested document of 1800 characters matching the goal text, on the unbanned domain 'sec.gov'",
      "seed_method": "cli",
      "records": [
        "1 `documents` row of 1800 characters ingested through the real document-ingest CLI",
        "`passages` holds 1024-dimension embeddings for it",
        "`sources` holds 0 rows carrying a Fulcrum `retrieved_at` value"
      ]
    },
    "canned_claims_file": {
      "description": "a JSON file at /tmp/fulcrum-canned.json containing the single fabricated entry [{\"claim\":\"invented success\"}], with an ingested corpus available",
      "seed_method": "cli",
      "records": [
        "/tmp/fulcrum-canned.json holds 1 fabricated claim entry",
        "`candidates` holds 0 rows",
        "`sources` holds 0 rows carrying a Fulcrum `retrieved_at` value"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN an ingested corpus holding 1 matching document of 1800 characters and 0 Fulcrum `sources` rows WHEN the operator runs `holo fulcrum '<goal>' --fresh --json` and SENSE executes one corpus retrieval THEN 1 `sources` row is written carrying url, retrieved_at, a 64-character content_hash and the full normalized_text",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the retrieval maps RRF hits straight into the gate payload and never writes a sources row",
            "normalized_text is populated from the truncated hybrid-search sourceText snippet rather than the fetched body",
            "the retrieval client is stubbed to return a canned hit list with no corpus query",
            "the run succeeds against an empty corpus, proving nothing was retrieved"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ingested_corpus_single_hit",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bun services/platform/src/cli/holo.ts fulcrum 'Assess whether usage-based AI support automation can sustain 70% gross margin' --fresh --json`",
                "SELECT url, retrieved_at, source_domain, content_hash, length(normalized_text) FROM sources WHERE retrieved_at IS NOT NULL"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 1",
                "the written row reports `length(normalized_text)` = 1800",
                "the written row carries a 64-character `content_hash`",
                "the written row carries `source_domain` = 'sec.gov' and a non-null `url`"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 0",
                "a `normalized_text` of 280 characters copied from the RRF snippet",
                "`content_hash` is NULL or empty"
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
      "description": "GIVEN an ingested corpus holding 2 matching documents, 1 of them on the banned domain 'contentfarm.example' WHEN the governed retrieval runs under the compiled `dev-revenue` contract THEN 1 `sources` row is written for 'sec.gov' and the banned url appears nowhere in the run's artifacts",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the ban-list is read but never applied, so the banned hit reaches the gate",
            "the ban-list field is dropped during contract compilation, leaving the filter with an empty list",
            "the filter drops every hit including the allowed one, so the run silently retrieves nothing",
            "the drop reason is not recorded, making the filter unobservable"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ingested_corpus_two_hits",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the governed Fulcrum retrieval for the same goal under the compiled `dev-revenue` contract",
                "SELECT source_domain, url FROM sources WHERE retrieved_at IS NOT NULL",
                "read the run's retrieve stage output from `mission_stage_runs`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 1",
                "the written row carries `source_domain` = 'sec.gov'",
                "the retrieve stage output records 1 dropped hit with reason `domain_banned`"
              ],
              "must_not_observe": [
                "a `sources` row carrying `source_domain` = 'contentfarm.example'",
                "`SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 2",
                "`SELECT count(*) FROM sources WHERE retrieved_at IS NOT NULL` returns 0"
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
      "description": "GIVEN an ingested corpus, 0 `candidates` rows, and /tmp/fulcrum-canned.json holding 1 fabricated claim WHEN the operator runs `holo fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json` THEN the response reports `errorCode` FULCRUM_CORPUS_ONLY and no candidate or fetch artifact is written",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the fulcrum instantiation keeps honouring args.researchEvidence, so a hand-written claims file becomes ledger content",
            "the corpus-only check is a no-op so the run still writes a candidate first",
            "the error is a generic MISSION_RUNTIME_FAILED with no named code the gate can assert"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "canned_claims_file",
            "action": {
              "actor": "cli_user",
              "steps": [
                "write /tmp/fulcrum-canned.json containing [{\"claim\":\"invented success\"}]",
                "run `bun services/platform/src/cli/holo.ts fulcrum '<goal>' --claims /tmp/fulcrum-canned.json --fresh --json`",
                "parse the JSON response and SELECT count(*) FROM candidates"
              ]
            },
            "end_state": {
              "must_observe": [
                "the JSON response contains `\"errorCode\":\"FULCRUM_CORPUS_ONLY\"`",
                "the response contains no `candidateId` key",
                "`SELECT count(*) FROM candidates` returns 0 after the refusal",
                "the process exit code reads 1"
              ],
              "must_not_observe": [
                "the response contains a `candidateId`",
                "the response contains a `dossierPath`",
                "the claim text 'invented success' persisted to `claims`",
                "no errorCode key present in the JSON response"
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
      "description": "GIVEN a corpus retrieval that already recorded 1 executed query for the candidate WHEN a second retrieval runs for the same candidate THEN 2 distinct executed queries are recorded and the second is not a near-duplicate of the first",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "executed queries are never recorded, so every cycle re-runs the same retrieval",
            "the dedupe check compares against a hardcoded list rather than the persisted history",
            "the second run reuses the first run's cached result instead of retrieving"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ingested_corpus_two_hits",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the governed Fulcrum retrieval once for the candidate and read the recorded query",
                "run the governed Fulcrum retrieval a second time for the same candidate",
                "read the recorded executed queries from the candidate's retrieval history"
              ]
            },
            "end_state": {
              "must_observe": [
                "the retrieval history holds 2 recorded queries",
                "the 2 recorded query strings are distinct",
                "the second retrieval reports `repeatedQuery` = false"
              ],
              "must_not_observe": [
                "the retrieval history holds 0 recorded queries",
                "the 2 recorded query strings are identical",
                "the second retrieval reports `repeatedQuery` = true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN an ingested 1800-character document and its hybrid-search hit whose snippet buffer is 280 characters WHEN the fetch artifact is written and compared against the snippet THEN `normalized_text` holds 1800 characters and a quote taken from the 280-character snippet slice fails verification against it",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod corpus + real embed role via FLEET_URL (rrfHybridSearch)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "normalized_text is hardcoded from the RRF sourceText snippet, making every snippet-sliced quote vacuously verifiable",
            "the artifact stores only the title, so normalized_text is far shorter than the fetched body",
            "the raw body is discarded and normalized_text is reconstructed from the hit metadata"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ingested_corpus_single_hit",
            "action": {
              "actor": "api_client",
              "steps": [
                "run the governed Fulcrum retrieval and read the written `sources` row",
                "read the corresponding hybrid-search hit snippet",
                "verify a quote built from the first 280 characters of a DIFFERENT hit's snippet against the written `normalized_text`"
              ]
            },
            "end_state": {
              "must_observe": [
                "the written `normalized_text` reports length 1800",
                "the written `normalized_text` differs from the 280-character snippet",
                "verifying the foreign 280-character snippet quote against `normalized_text` returns false",
                "verifying a verbatim 60-character span of `normalized_text` returns true"
              ],
              "must_not_observe": [
                "the written `normalized_text` reports length 280",
                "`normalized_text` is empty",
                "verifying the foreign snippet quote returns true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "One governed retrieval writes exactly 1 sources row carrying a non-null retrieved_at",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The written fetch artifact carries a 64-character content_hash",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The written fetch artifact carries an 1800-character normalized_text",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A corpus hit on the contract's banned domain produces zero sources rows",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The retrieve stage output records one dropped hit with reason domain_banned",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Running holo fulcrum with --claims returns errorCode FULCRUM_CORPUS_ONLY",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Running holo fulcrum with --claims exits with code 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "The refused --claims run leaves candidates at 0 rows",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "Two retrievals for one candidate record 2 distinct executed queries",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "A quote sliced from a foreign 280-character RRF snippet fails verification against the written normalized_text",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-corpus-fetch.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
