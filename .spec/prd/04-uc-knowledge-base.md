# Use Cases: Knowledge Base (KB)

| ID | Title | Description |
|----|-------|-------------|
| UC-KB-01 | Search Knowledge Base | User searches holocron using natural language queries |
| UC-KB-02 | Browse by Category | User browses articles filtered by category |
| UC-KB-03 | View Article | User reads full article content with metadata |
| UC-KB-04 | View Statistics | User sees holocron stats (total docs, category breakdown) |

---

## UC-KB-01: Search Knowledge Base

**Description:** User can search the holocron knowledge base using natural language queries, leveraging hybrid search (keyword + semantic) for best results.

**Acceptance Criteria:**
- ☐ User can enter a search query in the search input field on the explore screen
- ☐ System displays search results ranked by relevance score
- ☐ User can see title, category, and content snippet for each result
- ☐ User can filter search results by category
- ☐ User can tap a result to view the full article
- ☐ System shows "no results" state when query returns empty

---

## UC-KB-02: Browse by Category

**Description:** User can browse all articles within a specific category to discover related knowledge.

**Acceptance Criteria:**
- ☐ User can view list of all categories with document counts
- ☐ User can tap a category to see all articles in that category
- ☐ System displays articles sorted by most recent first
- ☐ User can see article title, date, and research type for each item
- ☐ User can paginate through large category lists (20 items per page)

---

## UC-KB-03: View Article

**Description:** User can read the full content of a research article including all metadata.

**Acceptance Criteria:**
- ☐ User can view article title, date, time, and category
- ☐ User can read full markdown content with proper formatting
- ☐ User can see research type and iteration count (for deep research)
- ☐ User can scroll through long articles smoothly
- ☐ User can navigate back to search/browse results

---

## UC-KB-04: View Statistics

**Description:** User can see overview statistics about the holocron knowledge base.

**Acceptance Criteria:**
- ☐ User can view total document count on home screen
- ☐ User can view breakdown of documents by category
- ☐ User can see 5 most recent documents with quick access
- ☐ System refreshes stats on pull-to-refresh gesture
