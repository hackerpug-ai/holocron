## Modular Design Analysis

### Existing Components Found
- `researchSessionById` (app/zero/queries.ts) — reused
- `Progress` (components/ui/progress.tsx) — reused
- `DeepResearchDetailView` — existing research detail surface, modified in place
- `ResearchProgressWithConvex` — existing progress card, rewired to hook

### Reuse Opportunities (Rule of 2)
- Progress label + bar pattern used in ResearchProgressWithConvex and DeepResearchDetailView → shared via useResearchProgress hook (data) + Progress atom (UI)

### Unmodular Code Flags
- none introduced; Progress testID wrapped in View for Maestro a11y id exposure

### Implementation Plan
- Reused: researchSessionById, Progress, SafeAreaView pattern from detail view
- Created: hooks/useResearchProgress.ts
- Modified: ResearchProgressWithConvex, DeepResearchDetailView
- Maestro: .maestro/reactive/research-progress-advances.yml + advance-server helper
