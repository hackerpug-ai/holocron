# pipes-4 RED Evidence (Sprint 22)
Generated: 2026-07-21T17:34:58.127101+00:00
RED commit: `678c89a81f76a2bca9b98b73b70caafc38e74b7e`
Message: `pipes-4 RED: failing integration suite for pipeline templates / no-shells / publish`

## Suite files
- `services/platform/tests/integration/red-business-report.test.ts`
- `services/platform/tests/integration/red-evidence-research.test.ts`
- `services/platform/tests/integration/red-no-shells.test.ts`
- `services/platform/tests/integration/red-sub-workflow-publish.test.ts`
- `services/platform/tests/integration/red-whatsnew.test.ts`

## FAIL captures

### AC-1-red-against-start.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-evidence-research.test.ts (1 test | 1 failed) 433ms
     × RED missing template: empty registry has no evidence-research; research run fails 158ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-evidence-research.test.ts > pipes-4 AC-1 RED — evidence-research template > RED missing template: empty registry has no evidence-research; research run fails
AssertionError: template not found: evidence-research — expected templates to exist: expected 0 to be greater than 0
 ❯ services/platform/tests/integration/red-evidence-research.test.ts:66:7
     64|       evidenceResearchCount,
     65|       'template not found: evidence-research — expected templates to e…
     66|     ).toBeGreaterThan(0);
       |       ^
     67|
     68|     // Also exercise the public CLI entrypoint used by ops (topic/comp…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:26:49
   Duration  934ms (transform 138ms, setup 108ms, import 301ms, tests 433ms, environment 0ms)


```

### AC-2-red-against-start.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-whatsnew.test.ts (1 test | 1 failed) 744ms
     × RED missing output fields: whatsNew must emit daily-briefing with headlines 438ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-whatsnew.test.ts > pipes-4 AC-2 RED — whatsNew output shape > RED missing output fields: whatsNew must emit daily-briefing with headlines
AssertionError: expected documentType to be daily-briefing; expected daily-briefing, got null: expected null to be 'daily-briefing' // Object.is equality

- Expected:
"daily-briefing"

+ Received:
null

 ❯ services/platform/tests/integration/red-whatsnew.test.ts:113:7
    111|       documentType,
    112|       `expected documentType to be daily-briefing; expected daily-brie…
    113|     ).toBe('daily-briefing');
       |       ^
    114|     expect(
    115|       headlines.length,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:26:50
   Duration  1.25s (transform 139ms, setup 106ms, import 308ms, tests 744ms, environment 0ms)


```

### AC-3-red-against-start.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-business-report.test.ts (1 test | 1 failed) 1089ms
     × RED one template: exactly 1 business-report row must cover all 4 kinds 817ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-business-report.test.ts > pipes-4 AC-3 RED — business-report one template 4 kinds > RED one template: exactly 1 business-report row must cover all 4 kinds
AssertionError: expected 1 template, found 4 — revenue-validation competitive ai-roi flights still separate: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ services/platform/tests/integration/red-business-report.test.ts:72:7
     70|       businessReportCount,
     71|       `expected 1 template, found ${separateCount} — revenue-validatio…
     72|     ).toBe(1);
       |       ^
     73|     expect(
     74|       separateCount,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:26:52
   Duration  1.59s (transform 138ms, setup 105ms, import 306ms, tests 1.09s, environment 0ms)


```

### AC-4-red-against-start.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-no-shells.test.ts (1 test | 1 failed) 365ms
     × RED modules present: expected 0 modules, found N for whatsnew/ assimilate/ shop/ subscriptions/ 87ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-no-shells.test.ts > pipes-4 AC-4 RED — no-shells / per-domain modules > RED modules present: expected 0 modules, found N for whatsnew/ assimilate/ shop/ subscriptions/
AssertionError: expected 0 modules, found N=4; expected 0, found 4; shells=convex/whatsNew/, convex/assimilate/, convex/shop/, convex/subscriptions/ (whatsnew/ assimilate/ shop/ subscriptions/): expected 4 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 4

 ❯ services/platform/tests/integration/red-no-shells.test.ts:103:7
    101|       n,
    102|       `expected 0 modules, found N=${n}; expected 0, found ${n}; shell…
    103|     ).toBe(0);
       |       ^
    104|     expect(
    105|       verify.status,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:26:55
   Duration  861ms (transform 133ms, setup 102ms, import 300ms, tests 365ms, environment 0ms)


```

### AC-5-red-against-start.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-sub-workflow-publish.test.ts (1 test | 1 failed) 886ms
     × RED missing document: subscriptions complete must publish document with source_run_id 570ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-sub-workflow-publish.test.ts > pipes-4 AC-5 RED — sub-workflow publish document row > RED missing document: subscriptions complete must publish document with source_run_id
AssertionError: expected document to exist — documents table empty or missing source_run_id column: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ services/platform/tests/integration/red-sub-workflow-publish.test.ts:147:7
    145|       docState.hasSourceRunId,
    146|       'expected document to exist — documents table empty or missing s…
    147|     ).toBe(true);
       |       ^
    148|     expect(
    149|       docState.linked,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:26:56
   Duration  1.39s (transform 139ms, setup 105ms, import 308ms, tests 886ms, environment 0ms)


```

### red-output.txt

```

 RUN  v4.1.0 /Users/inference1/Projects/holocron/.worktrees/pipes-4

 ❯ services/platform/tests/integration/red-no-shells.test.ts (1 test | 1 failed) 418ms
     × RED modules present: expected 0 modules, found N for whatsnew/ assimilate/ shop/ subscriptions/ 88ms
 ❯ services/platform/tests/integration/red-whatsnew.test.ts (1 test | 1 failed) 1078ms
     × RED missing output fields: whatsNew must emit daily-briefing with headlines 353ms
 ❯ services/platform/tests/integration/red-sub-workflow-publish.test.ts (1 test | 1 failed) 1197ms
     × RED missing document: subscriptions complete must publish document with source_run_id 669ms
 ❯ services/platform/tests/integration/red-evidence-research.test.ts (1 test | 1 failed) 1324ms
     × RED missing template: empty registry has no evidence-research; research run fails 143ms
 ❯ services/platform/tests/integration/red-business-report.test.ts (1 test | 1 failed) 1818ms
     × RED one template: exactly 1 business-report row must cover all 4 kinds 868ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/platform/tests/integration/red-business-report.test.ts > pipes-4 AC-3 RED — business-report one template 4 kinds > RED one template: exactly 1 business-report row must cover all 4 kinds
AssertionError: expected 1 template, found 4 — revenue-validation competitive ai-roi flights still separate: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ services/platform/tests/integration/red-business-report.test.ts:72:7
     70|       businessReportCount,
     71|       `expected 1 template, found ${separateCount} — revenue-validatio…
     72|     ).toBe(1);
       |       ^
     73|     expect(
     74|       separateCount,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  services/platform/tests/integration/red-evidence-research.test.ts > pipes-4 AC-1 RED — evidence-research template > RED missing template: empty registry has no evidence-research; research run fails
AssertionError: template not found: evidence-research — expected templates to exist: expected 0 to be greater than 0
 ❯ services/platform/tests/integration/red-evidence-research.test.ts:66:7
     64|       evidenceResearchCount,
     65|       'template not found: evidence-research — expected templates to e…
     66|     ).toBeGreaterThan(0);
       |       ^
     67|
     68|     // Also exercise the public CLI entrypoint used by ops (topic/comp…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  services/platform/tests/integration/red-no-shells.test.ts > pipes-4 AC-4 RED — no-shells / per-domain modules > RED modules present: expected 0 modules, found N for whatsnew/ assimilate/ shop/ subscriptions/
AssertionError: expected 0 modules, found N=4; expected 0, found 4; shells=convex/whatsNew/, convex/assimilate/, convex/shop/, convex/subscriptions/ (whatsnew/ assimilate/ shop/ subscriptions/): expected 4 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 4

 ❯ services/platform/tests/integration/red-no-shells.test.ts:103:7
    101|       n,
    102|       `expected 0 modules, found N=${n}; expected 0, found ${n}; shell…
    103|     ).toBe(0);
       |       ^
    104|     expect(
    105|       verify.status,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  services/platform/tests/integration/red-sub-workflow-publish.test.ts > pipes-4 AC-5 RED — sub-workflow publish document row > RED missing document: subscriptions complete must publish document with source_run_id
AssertionError: expected document to exist — documents table empty or missing source_run_id column: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ services/platform/tests/integration/red-sub-workflow-publish.test.ts:147:7
    145|       docState.hasSourceRunId,
    146|       'expected document to exist — documents table empty or missing s…
    147|     ).toBe(true);
       |       ^
    148|     expect(
    149|       docState.linked,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  services/platform/tests/integration/red-whatsnew.t
```

## verification-summary.json

```json
{
  "task_id": "pipes-4",
  "timestamp": "2026-07-21T15:27:01Z",
  "commit_sha": "678c89a81f76a2bca9b98b73b70caafc38e74b7e",
  "typecheck": {
    "exit_code": 0
  },
  "lint": {
    "exit_code": 0,
    "warnings": 0
  },
  "pre_existing_issues": false,
  "requirement_results": [
    {
      "id": "AC-1",
      "verify": "export PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test; pnpm vitest run services/platform/tests/integration/red-evidence-research.test.ts -t 'RED missing template' >.tmp/pipes-4/AC-1-red-against-start.txt 2>&1; cp .tmp/pipes-4/AC-1-red-against-start.txt /tmp/red-output.txt; grep 'template not found' .tmp/pipes-4/AC-1-red-against-start.txt",
      "exit_code": 0,
      "output_file": ".tmp/pipes-4/ac-1-output.txt"
    },
    {
      "id": "AC-2",
      "verify": "export PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test; pnpm vitest run services/platform/tests/integration/red-whatsnew.test.ts -t 'RED missing output fields' >.tmp/pipes-4/AC-2-red-against-start.txt 2>&1; grep 'expected documentType to be daily-briefing' .tmp/pipes-4/AC-2-red-against-start.txt",
      "exit_code": 0,
      "output_file": ".tmp/pipes-4/ac-2-output.txt"
    },
    {
      "id": "AC-3",
      "verify": "export PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test; pnpm vitest run services/platform/tests/integration/red-business-report.test.ts -t 'RED one template' >.tmp/pipes-4/AC-3-red-against-start.txt 2>&1; grep 'expected 1 template, found 4' .tmp/pipes-4/AC-3-red-against-start.txt",
      "exit_code": 0,
      "output_file": ".tmp/pipes-4/ac-3-output.txt"
    },
    {
      "id": "AC-4",
      "verify": "export PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test; pnpm vitest run services/platform/tests/integration/red-no-shells.test.ts -t 'RED modules present' >.tmp/pipes-4/AC-4-red-against-start.txt 2>&1; grep 'expected 0 modules, found N' .tmp/pipes-4/AC-4-red-against-start.txt",
      "exit_code": 0,
      "output_file": ".tmp/pipes-4/ac-4-output.txt"
    },
    {
      "id": "AC-5",
      "verify": "export PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test; pnpm vitest run services/platform/tests/integration/red-sub-workflow-publish.test.ts -t 'RED missing document' >.tmp/pipes-4/AC-5-red-against-start.txt 2>&1; grep 'expected document to exist' .tmp/pipes-4/AC-5-red-against-start.txt",
      "exit_code": 0,
      "output_file": ".tmp/pipes-4/ac-5-output.txt"
    },
    {
      "id": "TC-1",
      "verify": "test -f /tmp/red-output.txt && grep 'FAIL' /tmp/red-output.txt | wc -l | grep -v 0",
      "exit_code": 0,
      
```

## Lineage
- RED: 678c89a81f76a2bca9b98b73b70caafc38e74b7e (pipes-4 RED suite)
- GREEN: pipes-1 fa7315f5 / pipes-2 a37a7621 / pipes-3 c1f54760

## FAIL line count
FAIL occurrences across captures: 10
