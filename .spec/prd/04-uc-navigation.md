# Use Cases: Navigation (NV)

| ID | Title | Description |
|----|-------|-------------|
| UC-NV-01 | Open Drawer Menu | User opens the pushover drawer to see conversations and articles link |
| UC-NV-02 | Create New Chat | User starts a new conversation from the drawer |
| UC-NV-03 | Switch Conversation | User taps a conversation in the drawer to switch to it |
| UC-NV-04 | Manage Conversation | User renames or deletes a conversation from the drawer |
| UC-NV-05 | Search Conversations | User searches conversations in the drawer |
| UC-NV-06 | Navigate App Sections | User navigates to non-chat app sections from the drawer |

---

## UC-NV-01: Open Drawer Menu

**Description:** User can open a pushover (slide-over) drawer from the left edge to access the conversation list, app sections, and search. The drawer overlays the main content and follows the ChatGPT-style drawer pattern.

**Acceptance Criteria:**
- ☐ User can swipe from the left edge or tap a hamburger/menu icon to open the drawer
- ☐ Drawer slides over the main content (pushover style, not push-aside)
- ☑ Drawer header shows a **Search bar** for filtering conversations
- ☑ Drawer header shows a **Compose icon** (circular button with pencil) for new chat (like ChatGPT)
- ☑ Drawer shows **App section links** (Holocron, Articles, Settings) between header and conversations
- ☐ Drawer lists all conversations sorted by most recent activity
- ☑ Each conversation row shows the title and a preview of the last message
- ☐ User can tap outside the drawer or swipe left to dismiss it
- ☑ Drawer shows the currently active conversation as highlighted/selected

---

## UC-NV-02: Create New Chat

**Description:** User can create a new conversation from the drawer using the compose icon button, which opens an empty chat thread ready for input.

**Acceptance Criteria:**
- ☑ User can tap the **compose icon** (circular pencil button) in the drawer header to create a new conversation
- ☐ System creates a new conversation and navigates to the empty chat thread
- ☐ The drawer closes after navigation
- ☐ New conversation appears at the top of the conversation list in the drawer
- ☐ System auto-generates a default title (e.g., "New Chat" or based on first message)
- ☐ The conversation title updates automatically after the first message is sent (based on content)

---

## UC-NV-03: Switch Conversation

**Description:** User taps a conversation in the drawer to switch to that conversation's chat thread, preserving scroll position and history.

**Acceptance Criteria:**
- ☐ User can tap any conversation in the drawer list to switch to it
- ☐ System loads the selected conversation's message history
- ☐ The drawer closes after selection
- ☐ Chat thread scrolls to the most recent message in the selected conversation
- ☐ Previous conversation state is preserved (user can switch back without data loss)
- ☑ Active conversation is visually indicated in the drawer list

---

## UC-NV-04: Manage Conversation

**Description:** User can rename or delete a conversation from the drawer using long-press or swipe actions.

**Acceptance Criteria:**
- ☐ User can long-press a conversation row to reveal management actions
- ☐ User can rename a conversation by editing its title inline or via a dialog
- ☐ User can delete a conversation with a confirmation prompt
- ☐ Deleting a conversation removes it from the list and all associated messages
- ☐ If the active conversation is deleted, system navigates to the most recent remaining conversation
- ☐ If no conversations remain after deletion, system creates a new empty conversation

---

## UC-NV-05: Search Conversations

**Description:** User can search/filter conversations using the search bar in the drawer header. Search is real-time and filters the conversation list as the user types.

**Acceptance Criteria:**
- ☑ Drawer header contains a search input field with a search icon
- ☐ User can type a query to filter the conversation list in real-time
- ☐ Search matches against conversation titles and message content
- ☐ Matching conversations remain visible; non-matching conversations are hidden
- ☐ Clearing the search restores the full conversation list
- ☐ Empty search results show a "No results found" message
- ☐ Search query persists until explicitly cleared or drawer is closed

**Integration Criteria:**
- ☐ Search input `onSearchChange` callback wired to filter conversations state
- ☐ Conversations query accepts optional `searchQuery` parameter for server-side filtering
- ☐ Client-side filtering implemented as fallback for instant feedback
- ☐ Search debounced (300ms) before server query to reduce API calls

---

## UC-NV-06: Navigate App Sections

**Description:** User can navigate to non-chat sections of the app (Holocron main view, Articles, Settings) using section links displayed in the drawer, positioned between the search bar and conversation list.

**Acceptance Criteria:**
- ☑ Drawer displays **app section links** below the search bar and above conversations
- ☑ Section links include: **Holocron** (main chat), **Articles** (knowledge base), **Settings**
- ☑ Each section link shows an icon and label
- ☐ Tapping a section link navigates to that section of the app
- ☐ The drawer closes after navigation
- ☑ Section links are configurable (can add/remove sections)
- ☐ Current section is visually highlighted if applicable

**Integration Criteria:**
- ☐ `onHolocronPress` navigates to main chat screen using Expo Router
- ☐ `onArticlesPress` navigates to `/articles` screen using Expo Router
- ☐ `onSettingsPress` navigates to `/settings` screen using Expo Router
- ☐ Navigation callbacks call `router.navigate()` and close drawer via `navigation.closeDrawer()`
- ☐ Active section determined from current route and passed to highlight prop
