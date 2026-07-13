---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 1.0.0
---

# UI Infrastructure

**This is a backend platform migration with no new UI.** The RN/Expo app's screens, navigation (expo-router), component library (react-native-paper), styling (NativeWind), and theme all stay exactly as they are. What changes is strictly the **data layer beneath them**.

## What changes in the client

| Concern | Today (Convex) | After (Zero) |
|---------|----------------|--------------|
| Provider | `ConvexProvider` / `ConvexReactClient` in `app/_layout.tsx` | Zero provider (kept alongside the existing `QueryClientProvider`) |
| Reads | `useQuery(api.…)` (~48 sites) | Zero reactive query hooks over the published Postgres subset |
| Writes | `useMutation` / `useAction` (~57 sites) | Zero custom mutators (optimistic) → Mastra server owns the write |
| Live chat | reactive `chatMessages` row inserts (fake streaming) | real SSE token stream + Zero-durable message rows |
| Share URL | `EXPO_PUBLIC_CONVEX_URL` `.convex.cloud`→`.convex.site` rewrite | new Mastra `/article/` host |

Scope of the rewrite: ~105 hook call-sites across ~47 files (`convex/react` + `@/convex/_generated/api` imports), plus the provider swap. Zero's query semantics differ from Convex's, so this is a genuine rewrite, not a find-replace — and it is the highest-regression surface (see risks).

## Design tokens / component reuse

No changes. No new design libraries, tokens, or components are introduced by this migration. Storybook (103 stories) continues to cover components; the stories that mount a `ConvexProvider` mock are updated to the Zero equivalent.

## e2e provisioning (the real gap)

The app has **no device e2e framework today** (Storybook is component-only). The human-testing gate for this migration requires driving the real app against the real Mastra/Zero backend — so an RN e2e harness (Maestro or Detox, or metro-MCP-scripted journeys) must be **provisioned** as part of PLAT/SYNC. See the E2E Harness Constitution.
