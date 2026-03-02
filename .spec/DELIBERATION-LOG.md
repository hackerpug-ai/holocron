# Deliberation Log: Holocron Mobile Research Interface - Epic 1

> Date: 2026-03-01
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Epic Scope: Epic 1 - Foundation & Drawer Navigation

## Summary

- Use cases deliberated: 4 (UC-NV-01 through UC-NV-04)
- Items deferred: 3
- Estimated scope fit: Fits well within appetite (foundation epic)

## Decisions

| UC ID | UC Title | Decision | Rationale | Deferred Items |
|-------|----------|----------|-----------|----------------|
| UC-NV-01 | Open Drawer Menu | Core happy path + active highlighting | Foundation for all navigation; search bar renders as UI-only placeholder (wiring deferred to Epic 7) | Search functionality wiring, section link navigation logic |
| UC-NV-02 | Create New Chat | Full implementation | Critical path - users must be able to create conversations | Title auto-update after first message (requires Epic 2 chat) |
| UC-NV-03 | Switch Conversation | Full implementation | Core UX - conversation switching is essential for multi-conversation support | None |
| UC-NV-04 | Manage Conversation | Long-press menu with rename + delete | Covers essential management; swipe gestures deferred as polish | Swipe-to-delete gesture (long-press sufficient for v1) |

## Detailed Deliberations

### UC-NV-01: Open Drawer Menu

**Minimum Implementation:**
- Pushover drawer opens on left swipe or hamburger tap
- Drawer shows conversation list sorted by most recent
- Each conversation row shows title and last message preview
- Active conversation is highlighted
- Drawer header renders with search bar (UI only, no filtering logic) and compose button
- App section links (Holocron, Articles, Settings) render as tappable items
- Drawer dismisses on tap outside or swipe left

**Critical Edge Cases:**
- Active conversation must be visually distinct
- Drawer must overlay content (pushover, not push-aside)
- Empty state when no conversations exist

**Deferred to Future:**
- Search bar filtering logic (Epic 7: UC-NV-05)
- Section link navigation wiring (partial in Epic 1 for Articles, full in Epic 7)

**Recommendation:** Core implementation with placeholder search UI
**Rationale:** Search wiring is a separate use case (UC-NV-05) scheduled for Epic 7. The drawer must be functional for navigation but doesn't need filtering yet.

### UC-NV-02: Create New Chat

**Minimum Implementation:**
- Compose icon in drawer header creates new conversation
- System generates default title "New Chat"
- New conversation appears at top of list
- App navigates to the new empty chat thread
- Drawer closes after creation

**Critical Edge Cases:**
- Creating a conversation when none exist (first use)
- Rapid creation shouldn't create duplicates

**Deferred to Future:**
- Auto-title update based on first message content (requires Epic 2 chat-send integration)

**Recommendation:** Full implementation minus auto-title
**Rationale:** Auto-title requires chat message infrastructure from Epic 2. Default "New Chat" title with manual rename is sufficient for Epic 1.

### UC-NV-03: Switch Conversation

**Minimum Implementation:**
- Tap conversation row to switch
- Load selected conversation's state
- Close drawer after selection
- Scroll to most recent message position
- Preserve previous conversation state

**Critical Edge Cases:**
- Switching to a conversation with no messages (empty state)
- Switching back to a previously viewed conversation (state preservation)

**Deferred to Future:**
- None - all acceptance criteria are critical

**Recommendation:** Full implementation
**Rationale:** Conversation switching is fundamental to the multi-conversation UX. No scope reduction possible.

### UC-NV-04: Manage Conversation

**Minimum Implementation:**
- Long-press conversation row reveals action menu (rename, delete)
- Rename via dialog with text input
- Delete with confirmation dialog
- Deleting active conversation navigates to next most recent
- Deleting last conversation creates new empty conversation

**Critical Edge Cases:**
- Deleting the active/currently-viewed conversation
- Deleting the last remaining conversation
- Renaming to empty string (validation)

**Deferred to Future:**
- Swipe-to-delete gesture (long-press is sufficient for v1)

**Recommendation:** Long-press menu only
**Rationale:** Swipe gestures add complexity and aren't critical for core functionality. Long-press action menu covers all management needs.

## Constraints (from CONSTITUTION)

- Supabase backend with PostgreSQL and Edge Functions (Deno TypeScript)
- React Native (Expo) with NativeWind styling
- Service role key authentication (dev mode only)
- All data in user's Supabase instance

## Next Steps

Proceed to team spawn with these decisions as planning constraints.
Team members should reference this log when creating tasks.
