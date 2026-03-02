Verification Summary for RH-001

## Files Modified
- components/ui/icon.tsx - Updated to support both Lucide and Expo vector icons
- app/(drawer)/(tabs)/_layout.tsx - Replaced @expo/vector-icons import
- app/(tabs)/_layout.tsx - Replaced @expo/vector-icons import

## Acceptance Criteria Met
- [x] No direct @expo/vector-icons imports in layout files
- [x] All icons use @/components/ui/icon wrapper
- [x] Web build completes without errors
- [x] TypeScript compiles cleanly (pnpm tsc --noEmit)
