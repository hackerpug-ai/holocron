================================================================================
TASK: REC-MCP-01 - Expose findRecommendationsTool on holocron-mcp server
================================================================================

TASK_TYPE: FEATURE
STATUS: Backlog
TDD_PHASE: RED
CURRENT_AC: AC-1
PRIORITY: P1
EFFORT: M
TYPE: DEV
AGENT: mcp-implementer
ESTIMATE_MINUTES: 150
ITERATION: 1

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

MUST:
- MUST create holocron-mcp/src/tools/recommendations.ts wrapping the public Convex action api.research.actions.findRecommendations
- MUST add FindRecommendationsSchema to holocron-mcp/src/config/validation.ts matching the Convex validators field-for-field with a sync comment
- MUST register findRecommendationsTool in holocron-mcp/src/mastra/stdio.ts
- MUST bump the stdio.ts tool count log from 42 to 43

NEVER:
- NEVER reshape the Convex action result in the MCP wrapper — return it verbatim
- NEVER add auth logic (per CLAUDE.md this is a personal-app, keys are security)

STRICTLY:
- STRICTLY limit edits to holocron-mcp/** files

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective**: Expose `find_recommendations` via the holocron MCP server so external clients (Claude Code, other MCP consumers) can call `mcp__holocron__findRecommendationsTool` with the same args as the chat agent.

**Success looks like**: `cd holocron-mcp && bun run build` exits 0; stdio tool count logs 43; a manual MCP test call returns structured recommendations.

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

**Problem**: REC-003 created a public Convex action `findRecommendations`, but it isn't yet callable from external MCP clients. The holocron-mcp server needs a thin wrapper.

**Why it matters**: Claude Code and other MCP clients should be able to reuse this capability — not just the mobile app. It's the same tool surface, zero duplication.

**Current state**: `holocron-mcp/src/mastra/stdio.ts` registers 42 tools. No recommendations tool.

**Desired state**: 43 tools registered; new `recommendations.ts` wrapper delegates to the public Convex action; Zod schema in `validation.ts` synced field-for-field with the Convex validators.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads)
--------------------------------------------------------------------------------

AC-1: MCP tool wrapper created
  GIVEN: holocron-mcp without recommendations.ts
  WHEN: new wrapper is added
  THEN: holocron-mcp/src/tools/recommendations.ts exists and exports findRecommendationsTool
  VERIFY: `test -f holocron-mcp/src/tools/recommendations.ts && grep -q 'findRecommendationsTool' holocron-mcp/src/tools/recommendations.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-2: Zod schema matches Convex validators
  GIVEN: holocron-mcp/src/config/validation.ts
  WHEN: FindRecommendationsSchema is added
  THEN: schema has query/count/location/constraints fields matching the Convex action
  VERIFY: `grep -q 'FindRecommendationsSchema' holocron-mcp/src/config/validation.ts && grep -q 'sync with convex' holocron-mcp/src/config/validation.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-3: Registered in stdio and tool count bumped
  GIVEN: stdio.ts before edit
  WHEN: findRecommendationsTool is registered and log is updated
  THEN: stdio.ts includes the tool and logs '43 tools'
  VERIFY: `grep -q 'findRecommendationsTool' holocron-mcp/src/mastra/stdio.ts && grep -q '43' holocron-mcp/src/mastra/stdio.ts`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

AC-4: MCP build passes
  GIVEN: completed edits
  WHEN: bun run build runs in holocron-mcp
  THEN: exit 0
  VERIFY: `cd holocron-mcp && bun run build`
  TDD_STATE: [ ] RED  [ ] VERIFY_RED  [ ] GREEN  [ ] VERIFY_GREEN  [ ] REFACTOR

--------------------------------------------------------------------------------
TEST CRITERIA (Boolean Verification)
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | holocron-mcp/src/tools/recommendations.ts exists after task | AC-1 | `test -f holocron-mcp/src/tools/recommendations.ts` | [ ] TRUE [ ] FALSE |
| 2 | validation.ts contains FindRecommendationsSchema export when grep runs | AC-2 | `grep -q 'FindRecommendationsSchema' holocron-mcp/src/config/validation.ts` | [ ] TRUE [ ] FALSE |
| 3 | stdio.ts logs '43' tools after update | AC-3 | `grep -q '43' holocron-mcp/src/mastra/stdio.ts` | [ ] TRUE [ ] FALSE |
| 4 | holocron-mcp bun run build exits 0 | AC-4 | `cd holocron-mcp && bun run build` | [ ] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `holocron-mcp/src/mastra/stdio.ts` (lines 1-200) — existing tool registrations and tool count log
2. `holocron-mcp/src/config/validation.ts` (lines 1-200) — existing Zod schema patterns
3. `.spec/prd/smarter-chat-agent/05-uc-rec.md` (lines 191-204) — UC-REC-11 ACs

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `holocron-mcp/src/tools/recommendations.ts` (NEW)
- `holocron-mcp/src/config/validation.ts` (MODIFY)
- `holocron-mcp/src/mastra/stdio.ts` (MODIFY)

WRITE-PROHIBITED:
- `convex/**` (REC-003 owns the public action)
- `holocron-mcp/src/tools/**` (other tool files)

--------------------------------------------------------------------------------
CODE PATTERN (Reference)
--------------------------------------------------------------------------------

**Source**: `holocron-mcp/src/tools/*` existing wrappers

```ts
// holocron-mcp/src/config/validation.ts
// sync with convex/research/actions.ts findRecommendations args
export const FindRecommendationsSchema = z.object({
  query: z.string(),
  count: z.number().int().min(3).max(7).optional(),
  location: z.string().optional(),
  constraints: z.array(z.string()).optional(),
});

// holocron-mcp/src/tools/recommendations.ts
import { createTool } from '@mastra/core';
import { FindRecommendationsSchema } from '../config/validation';
import { convexClient } from '../config/convex-client';

export const findRecommendationsTool = createTool({
  id: 'findRecommendations',
  description: 'Find specific recommendations with contact details — inline response, no document created.',
  inputSchema: FindRecommendationsSchema,
  execute: async ({ context }) => {
    return await convexClient.action('research/actions:findRecommendations', context);
  },
});

// holocron-mcp/src/mastra/stdio.ts
import { findRecommendationsTool } from '../tools/recommendations';
// ...existing tool imports...

const tools = [
  // ...42 existing tools...
  findRecommendationsTool,
];
console.log(`Registered ${tools.length} tools`); // logs "Registered 43 tools"
```

**Anti-pattern**: Do NOT add auth; do NOT reshape the Convex result; do NOT duplicate validators.

**Interaction notes**:
- MCP wrapper delegates to the Convex public action — zero result reshaping
- Schema sync comment is a readability aid for future contributors

**Design references**:
- `.spec/prd/smarter-chat-agent/05-uc-rec.md:191-204`

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

| Gate | Command | Expected |
|------|---------|----------|
| MCP build | `cd holocron-mcp && bun run build` | Exit 0 |
| MCP tests | `cd holocron-mcp && bun test` | Exit 0 |
| Root typecheck unaffected | `pnpm tsc --noEmit` | Exit 0 |

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

**Implementation Agent**: mcp-implementer
**Rationale**: holocron-mcp TypeScript server: new tool wrapper + Zod schema + stdio registration + tool count bump. Pure MCP surface work.

**Review Agent**: mcp-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- `brain/docs/mcp-rules.md` (if present)
- `CLAUDE.md` — personal app, keys are security

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

**Depends On**: REC-003
**Blocks**: (none — leaf task)

--------------------------------------------------------------------------------
PRD REFS
--------------------------------------------------------------------------------

- UC-REC-11
- Build Sequence Task #14
- `.spec/prd/smarter-chat-agent/09-technical-requirements.md` lines 29-33

================================================================================
