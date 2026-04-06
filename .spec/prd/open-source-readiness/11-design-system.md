# 2.11 Design System & Frontend Polish (P1)

Remediate hardcoded colors, missing Storybook stories, inconsistent theming, and accessibility gaps identified by the Frontend/Design specialist review.

## Acceptance Criteria

### High — Theme Compliance & Design System Gaps

- [ ] AC-70: `components/conversations/ConversationRow.tsx` and `components/conversations/SwipeableRow.tsx` — Replace all hardcoded `#fff` hex values in delete button affordances with theme token references (e.g., `text-destructive-foreground` NativeWind class or `semantic.color.onDanger.default`).
- [ ] AC-71: `app/(tabs)/settings-screen.tsx` — Replace arbitrary Tailwind values in theme preview cards (`bg-[#0A0E14]`, etc.) with theme token classes already defined in `global.css` and `theme.ts`. No new tokens needed — map to existing ones.
- [ ] AC-72: `components/social/SocialPostsGroupCard.tsx` and `screens/SocialPostsListScreen.tsx` — Extract the duplicated `PLATFORM_COLORS` constant into a shared `lib/constants/platform-colors.ts` file and import from both locations.
- [ ] AC-73: `components/shop/ShopListingCard.tsx` — Consolidate the retailer color mapping (currently has redundant dark/light duplication) and replace the unthemed fallback gray with a theme-aware color token.
- [ ] AC-74: Fix `placeholderTextColor` inconsistencies across the codebase: (a) fix the broken HSL syntax that causes a native rendering bug, (b) ensure all placeholder color values have dark mode variants via theme tokens.
- [ ] AC-75: Add `.stories.tsx` files for key `components/ui/` primitives — at minimum: Button, Card, Badge, Input, and any other interactive components. Each story must have `Default` and `AllVariants` exports with proper Paper/theme decorators. Currently only `result-card` has a story — this is the biggest design system gap.
- [ ] AC-76: Voice-related story decorators (files matching `components/voice/*.stories.tsx`) — Replace all `RNText` imports (react-native `Text`) with Paper `Text` component, and replace all hardcoded hex color values with theme tokens.

### Medium — Component Architecture & Accessibility

- [ ] AC-77: `app/(tabs)/settings-screen.tsx` — Extract the inline `ThemePreviewCard` component into its own file at `components/settings/ThemePreviewCard.tsx` with a proper named export and co-located `.stories.tsx` file.
- [ ] AC-78: `components/ui/screen-header.tsx` — Replace fragile `min-w` side-zone centering with flex-based centering (`flex-1` on the title zone) to prevent layout breakage with longer titles or different back button text.
- [ ] AC-79: `components/ui/navigation-tooltip.tsx` — Replace hardcoded border color `#E2E8F0` with `border-border` theme class so it renders correctly in dark mode.
- [ ] AC-80: Audit all `Pressable` and `TouchableOpacity` components in `components/` — add `accessibilityRole="button"` and descriptive `accessibilityLabel` to every pressable interactive element that currently lacks them. Priority targets: result cards, list items, and action buttons.
- [ ] AC-81: `components/ui/category-badge.tsx` — Expand the category-to-variant mapping so that visually distinct categories are no longer mapped to the same variant. Target: no more than 3 categories share a single visual treatment.
