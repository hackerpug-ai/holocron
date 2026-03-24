# Use Cases: Article Management (AM)

| ID | Title | Description |
|----|-------|-------------|
| UC-AM-01 | Save Research | Research results auto-save with confirmation in chat |
| UC-AM-02 | Edit Article | User edits article content from the detail view |
| UC-AM-03 | Delete Article | User deletes an article via the detail view action |
| UC-AM-04 | Change Category | User recategorizes an article from the detail view |

---

## UC-AM-01: Save Research

**Description:** Research results are automatically saved to holocron upon completion. The agent confirms the save in the chat thread.

**Acceptance Criteria:**
- ☐ System automatically saves completed research to holocron
- ☐ Agent posts a confirmation message in chat with the document ID
- ☐ User can tap the confirmation to view the saved article
- ☐ If save fails, agent posts an error message with a retry option (user can type "retry save")
- ☐ Saved article is immediately searchable via `/search`

---

## UC-AM-02: Edit Article

**Description:** User can edit an article's content from the article detail view, which is accessed by tapping a result card.

**Acceptance Criteria:**
- ☐ User can tap the edit button in the article detail view
- ☐ User can modify the article title in a text input
- ☐ User can modify the article content in a markdown text editor
- ☐ User can save changes which updates the article in holocron
- ☐ System regenerates the embedding when content changes
- ☐ User can cancel the edit and discard changes

---

## UC-AM-03: Delete Article

**Description:** User can delete an article from the holocron knowledge base via the article detail view.

**Acceptance Criteria:**
- ☐ User can tap the delete button in the article detail view
- ☐ System shows a confirmation dialog before deletion
- ☐ User can confirm or cancel the deletion
- ☐ System removes the article from the database on confirm
- ☐ User returns to the chat thread with a confirmation message from the agent

---

## UC-AM-04: Change Category

**Description:** User can recategorize an article from the article detail view.

**Acceptance Criteria:**
- ☐ User can tap the category badge in the article detail view
- ☐ System shows a picker with all valid categories
- ☐ User can select a new category
- ☐ System updates the article's category in the database
- ☐ Agent confirms the category change in the chat thread
