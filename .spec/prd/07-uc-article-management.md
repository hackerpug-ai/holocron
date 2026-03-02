# Use Cases: Article Management (AM)

| ID | Title | Description |
|----|-------|-------------|
| UC-AM-01 | Save Research | User saves research results to holocron |
| UC-AM-02 | Edit Article | User modifies existing article content |
| UC-AM-03 | Delete Article | User removes article from holocron |
| UC-AM-04 | Change Category | User recategorizes an article |

---

## UC-AM-01: Save Research

**Description:** Research results are automatically saved to holocron upon completion, with user confirmation.

**Acceptance Criteria:**
- ☐ System automatically saves completed research to holocron
- ☐ User can see save confirmation with document ID
- ☐ User can view saved article immediately after save
- ☐ System displays error if save fails with retry option
- ☐ User can see article in knowledge base search after save

---

## UC-AM-02: Edit Article

**Description:** User can modify the content of an existing research article.

**Acceptance Criteria:**
- ☐ User can tap edit button on article view screen
- ☐ User can modify article title
- ☐ User can modify article content in markdown editor
- ☐ User can save changes to holocron
- ☐ System regenerates embedding on content change
- ☐ User can cancel edit and discard changes

---

## UC-AM-03: Delete Article

**Description:** User can remove an article from the holocron knowledge base.

**Acceptance Criteria:**
- ☐ User can tap delete button on article view screen
- ☐ System shows confirmation dialog before deletion
- ☐ User can confirm or cancel deletion
- ☐ System removes article from database on confirm
- ☐ User sees success message and returns to browse view

---

## UC-AM-04: Change Category

**Description:** User can move an article to a different category.

**Acceptance Criteria:**
- ☐ User can tap category on article view screen
- ☐ System shows picker with all valid categories
- ☐ User can select new category
- ☐ System updates article category in database
- ☐ Article appears in new category on next browse
