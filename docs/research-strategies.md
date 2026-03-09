# Research Strategies Comparison

Holocron supports three research strategies, automatically selected based on query characteristics.

## parallel_fan_out (Fast)

**Use for:** Simple questions, comparisons, definitions

**Characteristics:**
- 4 domain-specific queries in parallel
- Single-pass synthesis
- Target: ~15-25 seconds
- Quality: Good for straightforward queries

**Example triggers:**
- Simple questions with < 12 words
- Comparison queries (vs, compare)
- Default for most queries

## parallel_iteration (NEW)

**Use for:** Deep research, complex topics, multiple perspectives

**Characteristics:**
- 2-3 query variants executed in parallel
- Cross-variant synthesis
- Target: ~25-40 seconds
- Quality: Excellent for complex research

**Example triggers:**
- Explicit "deep/comprehensive/thorough" requests
- Long queries (> 15 words)
- Topics benefiting from multiple perspectives

**Trade-offs:**
- ✅ 2-3x faster than serial iteration
- ✅ Maintains depth through multiple variants
- ❌ Less adaptive than serial (can't refine based on previous results)
- ❌ Slightly higher token cost (parallel vs sequential)

## ralph_loop (Deepest)

**Use for:** When adaptive refinement matters most

**Characteristics:**
- Serial iteration with refinement
- Each iteration improves on previous gaps
- Target: ~45-90 seconds
- Quality: Best for nuanced research

**Example triggers:**
- Manual selection via API
- When refinement is critical

## Strategy Selection Logic

```
analyzeResearchStrategy(topic):
  if simple question (< 12 words) → parallel_fan_out
  if comparison query → parallel_fan_out
  if deep request keywords → parallel_iteration
  if long query (> 15 words) → parallel_iteration
  default → parallel_fan_out
```

## Performance Summary

| Strategy | Time | Quality | Parallelism |
|----------|------|---------|-------------|
| parallel_fan_out | ~15-25s | Good | 4 domains |
| parallel_iteration | ~25-40s | Excellent | 2-3 variants |
| ralph_loop | ~45-90s | Best | Serial |
