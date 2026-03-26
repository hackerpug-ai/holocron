# EPIC-08: Webview Integration

**Status**: [ ] Complete
**Epic ID**: FR-EPIC-08
**PRD Section**: Phase 4 - Webview Consistency

---

## Human-Testable Deliverables

After completing this epic, a human can:

1. **Open feed items in WebViewSheet**: All feed item content types open in consistent bottom sheet
2. **Verify consistent behavior**: All content uses useWebView hook
3. **Review documentation**: Code comments explain correct webview pattern

---

## Human Test Steps

1. Open app → navigate to "Subscriptions" feed
2. Tap a video feed item — verify opens in WebViewSheet
3. Tap a blog feed item — verify opens in WebViewSheet
4. Tap a social feed item — verify opens in WebViewSheet
5. Test navigation within WebViewSheet — verify back/forward work
6. Test swipe-to-dismiss — verify sheet closes properly
7. Check code — verify useWebView hook used consistently

---

## Task List

| Task ID | Title | Type | Effort |
|---------|-------|------|--------|
| [FR-029](FR-029.md) | Integrate WebViewSheet for all feed content | FEATURE | M |

---

## Acceptance Criteria (Epic Level)

- [ ] All feed item cards use useWebView hook
- [ ] WebViewSheet opens for all content types
- [ ] No direct Linking.openURL usage in feed components
- [ ] Code comments document correct pattern
- [ ] Consistent behavior across video/blog/social variants

---

## Dependencies

**Blocks**: None (final epic)
**Requires**: EPIC-01 (Backend), EPIC-06 (Feed Cards)

---

## Notes

- WebViewSheet already exists (components/webview/WebViewSheet.tsx)
- useWebView hook already exists (hooks/useWebView.ts)
- This epic is about integration consistency, not new code
- Document pattern for future developers
