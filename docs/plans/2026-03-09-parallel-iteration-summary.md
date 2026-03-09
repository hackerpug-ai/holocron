# Parallel Iteration Research - Implementation Summary

**Date:** 2026-03-09
**Status:** ✅ Complete

## What Was Built

Added parallel iteration research strategy to holocron for 2-3x faster deep research while maintaining quality.

### New Module: `convex/research/parallel_iteration.ts`

**Key Functions:**
- `generateQueryVariants()` - Creates 2-3 query variants using zaiFlash
- `executeParallelIteration()` - Runs variants in parallel, synthesizes with zaiPro
- `runParallelIteration()` - Public action entry point

**Characteristics:**
- Runs 2-3 query variants simultaneously (vs serial iteration)
- Each variant explores different angle (original, academic, industry)
- Synthesizes results across all variants
- Optional follow-up for identified gaps
- Target: 25-40 seconds (vs 45-90s for serial iteration)

### Updated Router: `convex/research/actions.ts`

**Changes:**
- Added `parallel_iteration` to `ResearchStrategy` type
- Updated `analyzeResearchStrategy()` routing logic:
  - Deep/comprehensive requests → `parallel_iteration`
  - Long queries (> 15 words) → `parallel_iteration`
  - Simple questions → `parallel_fan_out` (unchanged)
- Updated `startSmartResearch()` to handle new strategy

### Updated Exports: `convex/research/index.ts`

**Added exports:**
- `runParallelIteration` - Public action
- `executeParallelIteration` - Internal helper
- `generateQueryVariants` - Variant generator
- `ParallelIterationResult` - Result type
- `QueryVariant` - Variant type

## Performance Comparison

| Strategy | Time | Quality | Use Case |
|----------|------|---------|----------|
| `parallel_fan_out` | ~15-25s | Good | Simple questions, comparisons |
| `parallel_iteration` | ~25-40s | Excellent | Deep research, complex topics |
| `ralph_loop` | ~45-90s | Best | Adaptive refinement needed |

## Architecture

```
User Query
    ↓
analyzeResearchStrategy()
    ↓
    ├─ Simple/Comparison → parallel_fan_out (4 domains, 15-25s)
    ├─ Deep/Complex → parallel_iteration (2-3 variants, 25-40s) ← NEW
    └─ Manual → ralph_loop (serial, 45-90s)
```

## Trade-offs

**Parallel Iteration:**
- ✅ 2-3x faster than serial iteration
- ✅ Multiple perspectives for depth
- ✅ Leverages Z.ai yearly subscription (cheap zaiFlash calls)
- ❌ Less adaptive than serial (no refinement loop)
- ❌ Slightly higher token cost (parallel vs sequential)

## Testing

Manual testing performed via Convex dashboard:
- ✅ Strategy routing works correctly
- ✅ 3 variants generated and executed in parallel
- ✅ Synthesis combines results across variants
- ✅ Performance within target range (25-40s)

## Files Modified

- `convex/research/parallel_iteration.ts` (created)
- `convex/research/actions.ts` (updated - already done)
- `convex/research/index.ts` (updated)
- `docs/research-strategies.md` (created)

## Next Steps (Optional)

1. **Streaming results** - Post incremental updates as variants complete
2. **Result caching** - Cache search results across sessions
3. **Adaptive variant count** - Dynamically adjust variants based on topic complexity
4. **A/B testing** - Compare quality between parallel and serial iteration

## References

- Design doc: `docs/plans/2026-03-09-parallel-iteration-research-optimization.md`
- Strategy guide: `docs/research-strategies.md`
- Z.ai provider: `convex/lib/ai/zai_provider.ts`
