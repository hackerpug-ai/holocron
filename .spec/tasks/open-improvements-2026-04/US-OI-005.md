# US-OI-005: Research Agents React Redesign (Spike)

> Task ID: US-OI-005
> Type: SPIKE
> Priority: P3
> Estimate: 90 minutes
> Assignee: general-purpose
> Status: ✅ Completed
> Completed: 2026-04-06T12:45:00Z
> Commit: 8083bda9a015634747ad048f45489882ddfa6f77
> Reviewer: code-reviewer

## CRITICAL CONSTRAINTS

### MUST
- Read ALL files in `convex/research/` before producing the design document
- Read `convex/research/specialists/` to understand current specialist pattern
- Analyze hooks in `hooks/useResearchSession.ts` for reactive patterns already in use
- Produce a design document, NOT code changes

### NEVER
- Modify any source code in this spike
- Create migration scripts or schema changes
- Implement any part of the redesign

### STRICTLY
- Output is a design document in `.spec/prd/research-react-redesign/README.md`
- Document must include current vs proposed architecture diagrams (text-based)
- Document must identify breaking changes and migration path

## SPECIFICATION

**Objective:** Produce a design document for redesigning the research agent system using composable, react-inspired patterns. This is a spike - deliverable is a PRD, not code.

**Current Architecture:**
- `convex/research/dispatcher.ts` (262 lines) - Monolithic orchestrator
- `convex/research/parallel.ts` (550 lines) - Fan-out strategy, tightly coupled
- `convex/research/specialists/` - 4 domain specialists (academic, technical, product_finder, service_finder)
- Manual state tracking in variables
- Specialist selection via `detectSpecialist()` function
- Result aggregation via `aggregateTrackResults()`

**Desired Architecture:**
- Composable specialist agents with clear input/output contracts
- State machine for research lifecycle (PENDING -> SEARCHING -> SYNTHESIZING -> COMPLETE)
- Reusable patterns for side effects (status updates, error handling, retries)
- Separation of concerns: composition, execution, result handling

**Success looks like:** A comprehensive PRD that could be handed to an engineering team to implement the redesign in a future epic.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Spike is complete | Design doc exists | `.spec/prd/research-react-redesign/README.md` contains full PRD | `test -f .spec/prd/research-react-redesign/README.md` |
| 2 | Design doc is read | Architecture section reviewed | Current vs proposed architecture is clearly diagrammed | Read doc, verify both architectures described |
| 3 | Design doc is read | Migration section reviewed | Breaking changes and migration path are documented | Read doc, verify migration section exists |
| 4 | Design doc is read | Components section reviewed | Each composable agent/component has clear input/output contract | Read doc, verify interface definitions |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | PRD file exists at .spec/prd/research-react-redesign/README.md | AC-1 | `test -f .spec/prd/research-react-redesign/README.md && echo "exists"` | [x] TRUE [ ] FALSE |
| 2 | PRD contains "Current Architecture" and "Proposed Architecture" sections | AC-2 | `grep -c 'Current Architecture\|Proposed Architecture' .spec/prd/research-react-redesign/README.md` >= 2 | [x] TRUE [ ] FALSE |
| 3 | PRD contains migration/breaking changes section | AC-3 | `grep -ic 'migration\|breaking change' .spec/prd/research-react-redesign/README.md` > 0 | [x] TRUE [ ] FALSE |
| 4 | PRD contains interface/contract definitions for composable agents | AC-4 | `grep -ic 'interface\|contract\|input.*output' .spec/prd/research-react-redesign/README.md` > 0 | [x] TRUE [ ] FALSE |
| 5 | No source code files were modified | All | `git diff --name-only | grep -v '.spec/' | wc -l` returns 0 | [x] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `.spec/prd/research-react-redesign/README.md` (CREATE) - The PRD document
- `.spec/prd/research-react-redesign/*.md` (CREATE) - Supporting design artifacts

### WRITE-PROHIBITED
- `convex/research/*` - No code changes in a spike
- `convex/schema.ts` - No schema changes
- Any source code files

## DESIGN

### PRD Structure
```
.spec/prd/research-react-redesign/
├── README.md           # Main PRD
└── (optional supporting docs)
```

### PRD Sections
1. **Problem Statement** - Why the current architecture is limiting
2. **Current Architecture** - How dispatcher/parallel/specialists work today
3. **Proposed Architecture** - Composable agent pattern with state machine
4. **Component Contracts** - Input/output interfaces for each composable unit
5. **State Machine** - Research lifecycle states and transitions
6. **Migration Path** - How to incrementally move from current to proposed
7. **Breaking Changes** - What existing behavior changes
8. **Risks & Mitigations** - What could go wrong
9. **Future Extensions** - What this architecture enables

## CODING STANDARDS

- **CLAUDE.md**: Commit the PRD document

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/research/dispatcher.ts` - ALL
   Focus: Orchestration pattern, state management, specialist selection

2. `convex/research/parallel.ts` - ALL
   Focus: Fan-out strategy, result aggregation

3. `convex/research/specialists/` - ALL 4 files
   Focus: Input/output patterns, how specialists are invoked

4. `hooks/useResearchSession.ts` - ALL
   Focus: Reactive patterns already in use on the frontend

5. `convex/research/search.ts` - ALL
   Focus: Provider abstraction patterns
