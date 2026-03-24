# Use Cases: Knowledge Base (KB)

| ID | Title | Description |
|----|-------|-------------|
| UC-KB-01 | Search via Chat | User searches holocron by typing a query or `/search` command in chat |
| UC-KB-02 | Browse Categories | User browses articles by category via `/browse` command |
| UC-KB-03 | View Article from Card | User taps a result card to read the full article content |
| UC-KB-04 | View Statistics | User requests holocron stats via `/stats` command |
| UC-KB-05 | Browse Articles View | User navigates to the articles main view from the drawer to browse all documents |

---

## UC-KB-01: Search via Chat

**Description:** User can search the holocron knowledge base by typing a natural language query or using the `/search` command. Results appear as result cards in the chat stream.

**Acceptance Criteria:**
- ☐ User can type a natural language question in the chat input and the agent interprets it as a search
- ☐ User can type `/search <query>` to explicitly invoke holocron search
- ☐ System displays search results as a list of result cards inline in the chat thread
- ☐ Each result card shows title, category badge, relevance score, and content snippet
- ☐ User can tap a result card to open the full article in a detail view
- ☐ System shows a "no results found" message card when the query returns empty
- ☐ Agent can suggest refined queries if initial results are poor

---

## UC-KB-02: Browse Categories

**Description:** User can browse all articles within a category by using the `/browse` command, with results displayed as cards.

**Acceptance Criteria:**
- ☐ User can type `/browse` to see a card listing all categories with document counts
- ☐ User can type `/browse <category>` to see articles in that category as result cards
- ☐ Each article card shows title, date, and research type
- ☐ System displays articles sorted by most recent first
- ☐ User can tap an article card to view its full content
- ☐ System paginates results if more than 10 articles (agent offers "show more")

---

## UC-KB-03: View Article from Card

**Description:** User taps a result card in the chat stream to open the full article content in a detail view overlay.

**Acceptance Criteria:**
- ☐ User can tap any article result card to open a full-screen detail view
- ☐ User can view article title, date, time, category, and research type in the detail view
- ☐ User can read full markdown content with proper formatting (headers, code blocks, lists)
- ☐ User can scroll through long articles smoothly
- ☐ User can swipe back or tap a close button to return to the chat thread at the same scroll position
- ☐ Detail view shows action buttons for edit, delete, and recategorize (links to AM use cases)

---

## UC-KB-04: View Statistics

**Description:** User requests holocron statistics via `/stats` command, displayed as a summary card in the chat.

**Acceptance Criteria:**
- ☐ User can type `/stats` to request knowledge base statistics
- ☐ System displays a stats card showing total document count
- ☐ Stats card shows breakdown of documents by category
- ☐ Stats card shows 5 most recent documents as tappable links
- ☐ Agent can answer natural language questions about the knowledge base (e.g., "how many articles do I have?")

---

## UC-KB-05: Browse Articles View

**Description:** User navigates to a dedicated articles view from the drawer menu's "Articles" link. This provides a non-chat browsing experience for exploring the knowledge base — the secondary workflow after chat.

**Acceptance Criteria:**
- ☐ User can tap the "Articles" link in the drawer to navigate to the articles main view
- ☐ Articles view displays all documents as a scrollable list of article cards
- ☐ Articles are sorted by most recent first (default)
- ☐ Each article card shows title, category badge, date, and a content snippet
- ☐ User can filter articles by category using a horizontal chip/filter bar at the top
- ☐ User can search articles via a search input at the top of the view
- ☐ User can tap an article card to open the full article detail view
- ☐ User can navigate back to the chat from the articles view via the drawer or back button
- ☐ View shows a total document count in the header area
