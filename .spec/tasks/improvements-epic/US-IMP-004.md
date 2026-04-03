# US-IMP-004: Multi-Source Text Import

> Task ID: US-IMP-004
> Type: FEATURE
> Priority: P1
> Estimate: 180 minutes
> Assignee: frontend-designer

## CRITICAL CONSTRAINTS

### MUST
- Provide two import methods: chat agent command and "+" button in articles section
- Support plain text import from any source (copy-paste from other AI platforms)
- Preserve text formatting and structure when importing

### NEVER
- Modify existing article data structure
- Remove or alter current article creation flows

### STRICTLY
- Imported text MUST be appended to existing articles (not replace)
- Import MUST work for articles from any content source

## SPECIFICATION

**Objective:** Enable users to add text to holocron articles via chat agent or "+" button in articles section, allowing import of research from other AI platforms.

**Success looks like:** Users can select text from ChatGPT/Claude/etc., paste it into holocron via chat or "+" button, and have it appended to the relevant article with proper formatting.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | User in chat with article context | User sends "/add-text [content]" command | Text is appended to current article | `npx convex run documents/queries:get | jq '.content' | grep -q 'imported text'` |
| 2 | User viewing articles list | User clicks "+" button | Modal opens with text input field and article selector | Open articles screen and click "+", check for modal |
| 3 | User pastes text in import modal | User selects article and submits | Text is appended to selected article | `npx convex run documents/queries:list | jq '.[].updatedAt | sort | reverse | .[0]' | grep -q '[0-9]'` |
| 4 | Imported text contains markdown | Text is appended | Markdown formatting is preserved | Check article content for rendered markdown |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | Chat agent /add-text command appends text when executed | AC-1 | `Send "/add-text test import" in chat with article context, check document updates` | [ ] TRUE [ ] FALSE |
| 2 | "+" button opens import modal when clicked in articles view | AC-2 | `Click "+" in articles screen, verify modal present in DOM` | [ ] TRUE [ ] FALSE |
| 3 | Import modal appends text to selected article when submitted | AC-3 | `npx convex run documents/queries:get | jq '.content' | tail -20 | grep -q 'pasted text'` | [ ] TRUE [ ] FALSE |
| 4 | Markdown formatting renders after text import | AC-4 | `Import markdown text, check rendered HTML for formatted elements` | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `app/(drawer)/articles.tsx` (MODIFY) - Add "+" button
- `components/articles/ArticleImportModal.tsx` (NEW) - Import UI
- `components/chat/ChatInput.tsx` (MODIFY) - Add /add-text command
- `convex/documents/mutations.ts` (MODIFY) - Add appendText function

### WRITE-PROHIBITED
- `convex/schema.ts` - No schema changes needed
- Existing article creation flow - Don't break current article creation

## DESIGN

### References
- Current articles screen in `app/(drawer)/articles.tsx`
- Document mutations in `convex/documents/mutations.ts`
- Chat command parsing in existing chat components

### Interaction Notes
- "+" button should be near article list header
- Import modal should show article search/dropdown
- Chat command should work in article context or with article ID
- Consider batch import (multiple texts)

### Code Pattern
From `convex/documents/mutations.ts`:
```typescript
export const appendText = mutation({
  args: {
    documentId: v.id("documents"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    const updatedContent = doc.content + "\n\n" + args.text;

    await ctx.db.patch(args.documentId, {
      content: updatedContent,
      updatedAt: Date.now(),
    });

    return args.documentId;
  },
});
```

### Anti-pattern (DO NOT)
```typescript
// DON'T: Replace entire content
await ctx.db.patch(docId, { content: newText });

// DO: Append to existing content
const updated = doc.content + "\n\n" + newText;
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**:
  - Use Pressable with testID for "+" button
  - Modal must use Portal from react-native-paper
- **brain/docs/THEME-RULES.md**:
  - Use semantic spacing tokens for modal layout
  - Follow existing modal patterns in app

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `app/(drawer)/articles.tsx` - ALL
   Focus: Current articles screen structure

2. `convex/documents/mutations.ts` - ALL
   Focus: How documents are updated

3. `components/chat/ChatInput.tsx` - Lines 50-100
   Focus: How chat commands are parsed

4. `brain/docs/TDD-METHODOLOGY.md` - Sections: TDD Cycle
   Focus: RED → GREEN → REFACTOR workflow

## NOTES

- Import should preserve line breaks and markdown
- Consider adding attribution ("Imported from [source]")
- Test with text from ChatGPT, Claude, Perplexity
- "+" button should be consistent with other "+" buttons in app
