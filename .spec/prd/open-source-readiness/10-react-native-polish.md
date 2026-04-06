# 2.10 React Native Component & Hook Polish (P1)

Eliminate dead code, fix anti-patterns, and enforce naming consistency across React Native components and hooks.

## Acceptance Criteria

### Critical — Dead Code & Broken Features

- [ ] AC-58: `app/(drawer)/_layout.tsx` — Consolidate duplicate `useQuery(api.conversations.index.list)` calls (lines 31 and 207). Move both the query and the initialization `useEffect` (lines 220-237) into `CustomDrawerContent`. Remove the outer `DrawerLayout` component's `conversations` query entirely.
- [ ] AC-59: `app/(drawer)/_layout.tsx` — Delete all dead/stub state variables: `_isCreating` (line 41), `isRenaming` (line 42), `isDeleting` (line 43), `error` (line 44), `_isDrawerOpen` (line 23). Delete unused components `_InitialLoadingScreen` (line 178) and `_InitialErrorScreen` (line 190). Remove corresponding props from the `DrawerContent` call site.
- [ ] AC-60: `hooks/useOfflineQueue.ts` — The `submitFeedback` function (lines 77-83) is a `console.log` stub; `flushQueue` silently drops data. Remove the entire offline queue feature from the UI surface: delete `hooks/useOfflineQueue.ts`, `components/OfflineBanner.tsx`, and `components/QueueIndicator.tsx`. Remove all imports/usages of these modules across the codebase.
- [ ] AC-61: `hooks/use-auto-dismiss-captions.ts` (lines 22-64) — Consolidate the two `useEffect`s and `transcriptsRef` state-syncing anti-pattern into a single effect: `useEffect(() => { filterCaptions(); const interval = setInterval(filterCaptions, 1000); return () => clearInterval(interval); }, [transcripts, dismissAfterMs])`. Remove the ref and second effect.
- [ ] AC-62: `components/screens/article-detail.tsx` — Decompose this 688-line god component. Extract `NarrationBlockWrapper` into its own file at `components/screens/article-detail/NarrationBlockWrapper.tsx`. Extract narration scroll logic into a `useNarrationScroll` custom hook at `hooks/use-narration-scroll.ts`. Target: main component under ~400 lines.

### High — Naming Consistency

- [ ] AC-63: Rename 4 camelCase hook files to kebab-case to match the project convention (10 existing hooks already use kebab-case): `hooks/useNetworkStatus.ts` -> `hooks/use-network-status.ts`, `hooks/useOfflineQueue.ts` -> `hooks/use-offline-queue.ts` (if not deleted by AC-60), `hooks/useResearchSession.ts` -> `hooks/use-research-session.ts`, `hooks/useWebView.ts` -> `hooks/use-web-view.ts`. Update all imports across the codebase.

### Medium — Type Safety & Hook Misuse

- [ ] AC-64: `hooks/use-chat-history.ts:46` — Remove `msg: any` annotation in `.map()` callback. Use the inferred Convex type (`Doc<'chatMessages'>` or the query return type) for full type safety.
- [ ] AC-65: `hooks/useResearchSession.ts` (lines 32, 65) — Replace `sessionId as any` casts with proper `Id<'researchSessions'> | null` typing or explicit `as Id<'researchSessions'>` narrowing.
- [ ] AC-66: `hooks/use-voice-session.ts:416` — Remove the `"placeholder" as unknown as Id<"voiceSessions">` double-cast. Redesign `createTranscriptRecorder` to accept a getter function `() => Id<"voiceSessions">` instead of a static ID, eliminating the need for a placeholder value.
- [ ] AC-67: `components/chat/ChatInput.tsx` (lines 239-250) — Remove the `useCallback` wrapper on `handleCommandSelect`. The `triggers.command` dependency changes every render, making the memoization a no-op. Convert to a plain function.
- [ ] AC-68: `components/chat/ChatThread.tsx` (lines 87-108) — The `useCallback` wrappers on handlers passed to non-memoized `MessageBubble` and `MessageActionsSheet` children provide no benefit. Wrap `MessageBubble` in `React.memo` (preferred — it renders inside a FlatList) and keep the callbacks, OR drop the `useCallback` wrappers entirely.

### Cleanup — Committed Artifacts

- [ ] AC-69: `git rm` the two `.bak` files: `components/subscriptions/SubscriptionFeedScreen.tsx.bak` and `components/subscriptions/SocialCard.tsx.bak`. Add `*.bak` to `.gitignore`.
