# Epic 4: Knowledge Base & Result Cards

> Epic ID: epic-4-knowledge-base-result-cards
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Tasks: 10 (US-026 through US-035)
> Use Cases: UC-KB-01, UC-KB-02, UC-KB-03, UC-KB-04, UC-KB-05

## Theme

Stand up knowledge base search and browse via slash commands with result card rendering. After this epic, the user can search holocron via `/search`, browse categories via `/browse`, view stats via `/stats`, tap result cards to read articles in a detail overlay, and navigate to a dedicated Articles view for browsing the entire knowledge base.

## PRD Sections Covered

| Section | Use Case | Description |
|---------|----------|-------------|
| §06 | UC-KB-01 | Search via Chat |
| §06 | UC-KB-02 | Browse Categories |
| §06 | UC-KB-03 | View Article from Card |
| §06 | UC-KB-04 | View Statistics |
| §06 | UC-KB-05 | Browse Articles View |
| §11 | Technical Requirements | Result card rendering, ArticleDetail overlay |

## Deliberation Summary

| UC ID | Decision | Deferred Items |
|-------|----------|----------------|
| UC-KB-01 | Wire /search to existing RPC functions, render result cards | Agent query refinement (just show results) |
| UC-KB-02 | /browse lists categories, /browse <cat> shows articles | Pagination "show more" (first 10 only) |
| UC-KB-03 | ResultCard → ArticleDetail overlay, markdown render, swipe to close | Edit/delete/recategorize actions (Epic 7) |
| UC-KB-04 | /stats returns stats card | None |
| UC-KB-05 | Articles screen with list + filter chips + search | None (critical secondary view) |

Full deliberation: [DELIBERATION-LOG.md](../../.spec/DELIBERATION-LOG.md)

## Dependency Graph

```
US-026 (Search cmd)    US-027 (Browse cmd)    US-028 (Stats cmd)
    |                       |                       |
    v                       v                       v
US-029 (ResultCard Design)                       |
    |                       |                       |
    +-----------------------+-----------------------+
                            |
                            v
                     US-030 (Card Integration)
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
  US-031 (ArticleDetail)  US-032 (Detail View)  US-033 (Articles Screen Design)
        |                   |                       |
        +-------------------+-----------------------+
                            |
                            v
                     US-034 (Wire Articles Screen)
                            |
                            v
                     US-035 (Drawer Link to Articles)
```

### Parallel Execution Lanes

| Lane | Tasks | Description |
|------|-------|-------------|
| **Backend** | US-026, US-027, US-028 (parallel) | Slash command handlers for KB operations |
| **Design** | US-029, US-033 (parallel, after US-026/027/028) | ResultCard and Articles screen design |
| **Integration** | US-030 (after US-029) | Wire result cards to chat |
| **Design** | US-031, US-032 (after US-030) | ArticleDetail overlay design |
| **Integration** | US-034 (after US-032, US-033) | Wire Articles screen to API |
| **Integration** | US-035 (after US-034) | Link drawer to Articles view |

## Task Summary

| ID | Title | Type | Priority | Agent | Score |
|----|-------|------|----------|-------|-------|
| US-026 | Build /search command handler with hybrid_search | feature | P1 | supabase-implementer | -- |
| US-027 | Build /browse command handler with categories | feature | P1 | supabase-implementer | -- |
| US-028 | Build /stats command handler | feature | P2 | supabase-implementer | -- |
| US-029 | Design ResultCard component - story + variants | feature:design | P1 | react-native-ui-implementer | -- |
| US-030 | Wire ResultCard to chat-send response rendering | feature:integration | P2 | react-native-ui-implementer | -- |
| US-031 | Design ArticleDetail overlay - story + variants | feature:design | P1 | react-native-ui-implementer | -- |
| US-032 | Design ArticleDetail content with markdown rendering | feature:design | P1 | react-native-ui-implementer | -- |
| US-033 | Design ArticlesScreen - story + variants | feature:design | P1 | react-native-ui-implementer | -- |
| US-034 | Wire ArticlesScreen to documents API | feature:integration | P2 | react-native-ui-implementer | -- |
| US-035 | Wire drawer Articles link to ArticlesScreen | feature:integration | P2 | react-native-ui-implementer | -- |

**Average Quality Score: --/100** (pending generation)

## Human Test Steps

1. Type `/search React hooks` in chat and verify result cards appear with title, category badge, relevance score, and snippet
2. Type `/browse` and verify a category list card appears with all categories and document counts
3. Type `/browse architecture` and verify article cards appear for that category (max 10)
4. Type `/stats` and verify a stats card appears with total documents and breakdown by category
5. Tap any result card and verify the ArticleDetail overlay opens with full markdown content
6. Verify the ArticleDetail overlay can be dismissed by swiping down or tapping the back button
7. Tap the "Articles" link in the drawer and verify the ArticlesScreen opens
8. Verify the ArticlesScreen shows a scrollable list of article cards with category filter chips at the top
9. Tap a category chip in ArticlesScreen and verify the list filters to that category
10. Use the search input in ArticlesScreen and verify results filter as you type

## Agent Roster

| Agent | Tasks | Verified |
|-------|-------|----------|
| supabase-implementer | US-026, US-027, US-028 | Yes |
| react-native-ui-implementer | US-029, US-030, US-031, US-032, US-033, US-034, US-035 | Yes |

## Blocks

Epic 5 (Basic Research), Epic 6 (Deep Research), Epic 7 (Article Management)
