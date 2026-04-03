# US-IMP-001: Research Reports Outline Format

> Task ID: US-IMP-001
> Type: FEATURE
> Priority: P1
> Estimate: 180 minutes
> Assignee: react-vite-implementer

## CRITICAL CONSTRAINTS

### MUST
- Read existing research report rendering components before modifying
- Maintain backward compatibility with existing research reports
- Preserve all existing research data without migration

### NEVER
- Modify research session schema or data structures
- Change how research data is stored, only change presentation
- Remove any existing research content or formatting options

### STRICTLY
- Outline format must be the DEFAULT for all new research reports
- Users must be able to opt-out if they prefer dense paragraphs

## SPECIFICATION

**Objective:** Modify research report generation to produce outline-style, scannable format instead of information-dense paragraphs.

**Success looks like:** Research reports display with clear hierarchical structure, bullet points, and sections that can be easily scanned and skimmed.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Research session completes | New report is generated | Report displays in outline format with sections and bullet points | `grep -r "outline" convex/research/*.ts | grep -i format` |
| 2 | User views research report | Report renders on screen | Content uses markdown outline syntax (headers, bullets, numbered lists) | Open any research report in app and inspect DOM for `<ul>`, `<ol>`, `<h3>` tags |
| 3 | User reads research report | Scanning through content | Key findings are visually distinct from supporting details | `npx convex run research/queries:get -- '{"id":"..."}' | jq '.content | contains("**Key Finding**")'` |
| 4 | Research report contains dense paragraphs | Legacy report loads | Existing reports still render correctly without migration | Query a research report from before this change |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Research report uses outline markdown format when new research session completes | AC-1 | `npx convex run research/actions:startSimpleResearch | jq -r '.report' | head -50 | grep -E '^\s*[-*#]' | wc -l | grep -q '[1-9]'` | [ ] TRUE [ ] FALSE |
| 2 | Research report HTML contains outline elements when rendered | AC-2 | Manual: Open research report and check browser DevTools for outline elements | [ ] TRUE [ ] FALSE |
| 3 | Key findings section exists and is visually distinct when report is generated | AC-3 | `npx convex run research/queries:get | jq -r '.content' | grep -A5 "## Key Findings" | grep -q '^\s*-'` | [ ] TRUE [ ] FALSE |
| 4 | Legacy research reports render without errors when viewed | AC-4 | Open any research report created before this change | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `convex/research/actions.ts` (MODIFY) - Update research generation prompts
- `convex/research/internal.ts` (MODIFY) - Modify report formatting logic
- `components/research/*.tsx` (MODIFY) - Update report rendering components

### WRITE-PROHIBITED
- `convex/schema.ts` - No schema changes needed
- `convex/research/mutations.ts` - Data structure changes not needed
- Any migration files - No data migration required

## DESIGN

### References
- Current research report rendering in app
- Markdown outline format best practices
- Existing research prompts in `convex/research/prompts.ts`

### Interaction Notes
- Report generation time should not increase significantly
- Outline format should work for both short and long reports
- Consider collapsible sections for very long reports

### Code Pattern
From `convex/research/actions.ts`:
```typescript
export const startSimpleResearch = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // Current implementation generates paragraph-based reports
    // Modify to generate outline format with clear sections
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Hardcode outline format in every prompt
const prompt = `
Generate an outline:
1. Point one
2. Point two
`;

// DO: Use a template system for consistent outline formatting
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use semantic HTML for outline rendering
  - Ensure proper heading hierarchy
- **brain/docs/THEME-RULES.md**:
  - Use semantic spacing tokens for outline indentation
  - Maintain consistent typography hierarchy

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `convex/research/actions.ts` - ALL
   Focus: How research reports are currently generated

2. `convex/research/prompts.ts` - ALL
   Focus: Current prompts used for research generation

3. `components/research/ResearchReportView.tsx` (or similar)
   Focus: How research reports are rendered to users

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- This is a prompt engineering change more than a code change
- Test with various research queries to ensure outline quality
- Consider user preference setting for outline vs paragraph format (future enhancement)
- Ensure outline format works for all research types (simple, deep, parallel)
