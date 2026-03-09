# Research Loop Improvement Plan - Convex Backend

## Current Architecture

### Research Strategies (3 paths)
1. **startSmartResearch** - Router (entry point)
   - Analyzes query → selects strategy
   - Routes to parallel_fan_out OR ralph_loop

2. **runRalphLoop** - Deep iterative research
   - 5 iterations max
   - Loop until: coverage >= 4 AND confidence >= 70
   - Steps: SEARCH → SYNTHESIZE → REVIEW → SAVE → POST → REFINE

3. **executeParallelFanOut** - Fast parallel research
   - Single-pass
   - Decomposes into 4 domain queries
   - Executes in parallel
   - Target: 15-25s

### Current Issues

#### 1. **Architectural Issues**
```typescript
// Current: 600+ line monolithic function
async function runRalphLoop() {
  // Orchestration + execution mixed together
  while (iteration < maxIterations && (coverage < 4 || confidence < 70)) {
    // SEARCH logic inline
    // SYNTHESIZE logic inline
    // REVIEW logic inline
    // All hardcoded
  }
}
```

**Problems:**
- No separation of concerns
- Hardcoded exit conditions
- Difficult to test individual phases
- No strategy extensibility
- Tight coupling between phases

#### 2. **Loop Termination Issues**
```typescript
while (iteration < maxIterations && (coverageScore < 4 || averageConfidence < 70))
```

**Problems:**
- Hardcoded thresholds
- No dynamic adjustment
- No cost awareness
- No time budget management
- All-or-nothing (no partial success)

#### 3. **State Management Issues**
- Session state spread across multiple tables
- No clear state machine
- Difficult to resume/checkpoint
- No rollback capability

#### 4. **Feedback Loop Issues**
- Review feedback not stored structurally
- No learning from past research
- No confidence improvement tracking
- Gap resolution not measured

---

## Proposed Improvements

### Phase 1: Extract Research Loop Core (Refactor)

#### 1.1 Create Loop State Machine

```typescript
// convex/research/loop-state.ts
export type LoopPhase =
  | 'INITIALIZE'
  | 'SEARCH'
  | 'SYNTHESIZE'
  | 'REVIEW'
  | 'REFINE'
  | 'COMPLETE'
  | 'ERROR'

export interface LoopState {
  sessionId: Id<"deepResearchSessions">
  phase: LoopPhase
  iteration: number
  metrics: {
    coverageScore: number
    confidenceScore: number
    gapCount: number
    citationCount: number
    costUsd: number
    durationMs: number
  }
  context: ResearchContext
  decisions: {
    shouldContinue: boolean
    reason: string
    nextPhase: LoopPhase
  }
}
```

#### 1.2 Create Phase Executors

```typescript
// convex/research/phases/search.ts
export async function executeSearchPhase(
  state: LoopState
): Promise<{
  findings: string
  structuredResults: StructuredSearchResult[]
  metrics: PhaseMetrics
}>

// convex/research/phases/synthesize.ts
export async function executeSynthesisPhase(
  state: LoopState,
  searchResults: SearchResults
): Promise<{
  findings: StructuredFinding[]
  narrative: string
  metrics: PhaseMetrics
}>

// convex/research/phases/review.ts
export async function executeReviewPhase(
  state: LoopState,
  synthesis: SynthesisResult
): Promise<{
  coverageScore: number
  gaps: string[]
  feedback: string
  shouldContinue: boolean
  metrics: PhaseMetrics
}>
```

#### 1.3 Create Termination Strategy

```typescript
// convex/research/termination.ts
export interface TerminationStrategy {
  name: string
  shouldTerminate(state: LoopState): {
    terminate: boolean
    reason: string
  }
}

export class QualityBasedTermination implements TerminationStrategy {
  name = "quality_based"

  shouldTerminate(state: LoopState) {
    // Coverage >= 4 AND Confidence >= 70
    if (state.metrics.coverageScore >= 4 && state.metrics.confidenceScore >= 70) {
      return { terminate: true, reason: "Quality thresholds met" }
    }

    // Max iterations
    if (state.iteration >= state.maxIterations) {
      return { terminate: true, reason: "Max iterations reached" }
    }

    return { terminate: false, reason: "" }
  }
}

export class CostAwareTermination implements TerminationStrategy {
  name = "cost_aware"

  constructor(private maxCostUsd: number) {}

  shouldTerminate(state: LoopState) {
    if (state.metrics.costUsd >= this.maxCostUsd) {
      return { terminate: true, reason: `Cost limit reached: $${state.metrics.costUsd}` }
    }

    // Diminishing returns: stop if improvement < 5%
    if (state.iteration > 1) {
      const previousConfidence = state.history[state.iteration - 2].metrics.confidenceScore
      const improvement = state.metrics.confidenceScore - previousConfidence
      if (improvement < 5) {
        return { terminate: true, reason: "Diminishing returns" }
      }
    }

    return { terminate: false, reason: "" }
  }
}

export class TimeBasedTermination implements TerminationStrategy {
  name = "time_based"

  constructor(private maxDurationMs: number) {}

  shouldTerminate(state: LoopState) {
    if (state.metrics.durationMs >= this.maxDurationMs) {
      return { terminate: true, reason: "Time limit reached" }
    }
    return { terminate: false, reason: "" }
  }
}
```

#### 1.4 Create Loop Orchestrator

```typescript
// convex/research/loop-orchestrator.ts
export class ResearchLoopOrchestrator {
  constructor(
    private terminationStrategies: TerminationStrategy[],
    private checkpointInterval: number = 1 // Save after each iteration
  ) {}

  async execute(
    ctx: ActionCtx,
    sessionId: Id<"deepResearchSessions">,
    initialTopic: string,
    maxIterations: number = 5
  ): Promise<LoopState> {

    let state: LoopState = await this.initialize(ctx, sessionId, initialTopic, maxIterations)

    while (true) {
      // Check termination
      const shouldStop = this.checkTermination(state)
      if (shouldStop.terminate) {
        state.phase = 'COMPLETE'
        state.decisions.shouldContinue = false
        state.decisions.reason = shouldStop.reason
        break
      }

      // Execute current phase
      state = await this.executePhase(ctx, state)

      // Checkpoint
      if (state.iteration % this.checkpointInterval === 0) {
        await this.checkpoint(ctx, state)
      }

      // Move to next phase
      state = await this.transition(ctx, state)
    }

    return state
  }

  private checkTermination(state: LoopState): { terminate: boolean; reason: string } {
    for (const strategy of this.terminationStrategies) {
      const result = strategy.shouldTerminate(state)
      if (result.terminate) {
        return result
      }
    }
    return { terminate: false, reason: "" }
  }

  private async executePhase(ctx: ActionCtx, state: LoopState): Promise<LoopState> {
    switch (state.phase) {
      case 'SEARCH':
        return await executeSearchPhase(ctx, state)
      case 'SYNTHESIZE':
        return await executeSynthesisPhase(ctx, state)
      case 'REVIEW':
        return await executeReviewPhase(ctx, state)
      case 'REFINE':
        return await executeRefinePhase(ctx, state)
      default:
        throw new Error(`Unknown phase: ${state.phase}`)
    }
  }

  private async transition(ctx: ActionCtx, state: LoopState): Promise<LoopState> {
    // State machine transitions
    const transitions: Record<LoopPhase, LoopPhase> = {
      'INITIALIZE': 'SEARCH',
      'SEARCH': 'SYNTHESIZE',
      'SYNTHESIZE': 'REVIEW',
      'REVIEW': 'REFINE',
      'REFINE': 'SEARCH', // Loop back
      'COMPLETE': 'COMPLETE',
      'ERROR': 'ERROR'
    }

    state.phase = transitions[state.phase]
    if (state.phase === 'SEARCH') {
      state.iteration++
    }

    return state
  }

  private async checkpoint(ctx: ActionCtx, state: LoopState): Promise<void> {
    await ctx.runMutation(api.research.mutations.saveLoopCheckpoint, {
      sessionId: state.sessionId,
      state: JSON.stringify(state)
    })
  }
}
```

---

### Phase 2: Add Smart Termination Strategies

#### 2.1 Composite Termination Strategy

```typescript
// convex/research/termination.ts
export class CompositeTermination implements TerminationStrategy {
  name = "composite"

  constructor(
    private strategies: Array<{ strategy: TerminationStrategy; weight: number }>
  ) {}

  shouldTerminate(state: LoopState) {
    let score = 0
    let reasons: string[] = []

    for (const { strategy, weight } of this.strategies) {
      const result = strategy.shouldTerminate(state)
      if (result.terminate) {
        score += weight
        reasons.push(`${strategy.name}: ${result.reason}`)
      }
    }

    // Terminate if weighted score >= 1.0
    if (score >= 1.0) {
      return {
        terminate: true,
        reason: reasons.join(" | ")
      }
    }

    return { terminate: false, reason: "" }
  }
}

// Usage:
const termination = new CompositeTermination([
  { strategy: new QualityBasedTermination(), weight: 0.5 },
  { strategy: new CostAwareTermination(5.0), weight: 0.3 },
  { strategy: new TimeBasedTermination(300000), weight: 0.2 }
])
```

#### 2.2 Adaptive Termination

```typescript
export class AdaptiveTermination implements TerminationStrategy {
  name = "adaptive"

  shouldTerminate(state: LoopState) {
    // Learn from past sessions
    const historicalAvgIterations = await this.getHistoricalAverage(state.topic)

    // Adjust thresholds based on topic complexity
    const complexityScore = this.estimateComplexity(state.topic)
    const adjustedCoverageThreshold = 4 - (complexityScore * 0.5) // Easier topics need higher coverage

    // Diminishing returns detection
    const improvementRate = this.calculateImprovementRate(state.history)

    if (improvementRate < 0.05 && state.iteration >= historicalAvgIterations) {
      return {
        terminate: true,
        reason: "Diminishing returns - further iterations unlikely to improve"
      }
    }

    return { terminate: false, reason: "" }
  }
}
```

---

### Phase 3: Add Feedback Loop Improvements

#### 3.1 Gap Resolution Tracking

```typescript
// convex/research/gap-tracking.ts
export interface GapTracker {
  sessionId: Id<"deepResearchSessions">
  gaps: Array<{
    id: string
    text: string
    identifiedIn: number // iteration number
    resolvedIn?: number
    resolutionConfidence?: number
  }>
}

export async function trackGapResolution(
  ctx: ActionCtx,
  sessionId: Id<"deepResearchSessions">,
  iteration: number,
  previousGaps: string[],
  currentFindings: StructuredFinding[]
): Promise<GapResolutionMetrics> {
  // Match findings to gaps using semantic similarity
  const resolvedGaps = []

  for (const gap of previousGaps) {
    const matchingFindings = await findMatchingFindings(gap, currentFindings)
    if (matchingFindings.length > 0) {
      resolvedGaps.push({
        gap,
        resolvedBy: matchingFindings,
        confidence: averageConfidence(matchingFindings)
      })
    }
  }

  return {
    totalGaps: previousGaps.length,
    resolvedGaps: resolvedGaps.length,
    resolutionRate: resolvedGaps.length / previousGaps.length,
    averageResolutionConfidence: average(resolvedGaps.map(g => g.confidence))
  }
}
```

#### 3.2 Confidence Improvement Tracking

```typescript
// convex/research/confidence-tracking.ts
export async function trackConfidenceImprovement(
  state: LoopState
): Promise<ConfidenceImprovementMetrics> {
  if (state.iteration === 1) {
    return { improvement: 0, trajectory: 'initial' }
  }

  const previousIteration = state.history[state.iteration - 2]
  const currentConfidence = state.metrics.confidenceScore
  const previousConfidence = previousIteration.metrics.confidenceScore

  const improvement = currentConfidence - previousConfidence
  const improvementRate = improvement / previousConfidence

  // Predict if next iteration will be valuable
  const trajectory = improvementRate > 0.10 ? 'accelerating' :
                    improvementRate > 0.05 ? 'steady' :
                    improvementRate > 0 ? 'diminishing' :
                    'plateaued'

  return {
    improvement,
    improvementRate,
    trajectory,
    predictedNextImprovement: this.predictNextImprovement(state.history)
  }
}
```

---

### Phase 4: Refactored API

#### New Entry Point

```typescript
// convex/research/actions.ts
export const startResearchWithStrategy = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    topic: v.string(),
    strategy: v.optional(v.union(
      v.literal("auto"),
      v.literal("fast"), // Parallel fan-out
      v.literal("deep"), // Ralph Loop
      v.literal("adaptive") // New: smart loop
    )),
    options: v.optional(v.object({
      maxIterations: v.optional(v.number()),
      maxCostUsd: v.optional(v.number()),
      maxDurationMs: v.optional(v.number()),
      qualityThresholds: v.optional(v.object({
        coverage: v.number(),
        confidence: v.number()
      }))
    }))
  },
  handler: async (ctx, { conversationId, topic, strategy = "auto", options = {} }) => {
    // Select strategy
    const selectedStrategy = strategy === "auto"
      ? analyzeResearchStrategy(topic)
      : strategy

    if (selectedStrategy === "fast") {
      return await executeParallelFanOut(ctx, conversationId, topic)
    }

    if (selectedStrategy === "deep") {
      // Old Ralph Loop (backwards compatible)
      return await runRalphLoop(ctx, sessionId, conversationId, topic, options.maxIterations)
    }

    if (selectedStrategy === "adaptive") {
      // NEW: Smart loop with pluggable termination
      const terminationStrategies = [
        new QualityBasedTermination(
          options.qualityThresholds?.coverage ?? 4,
          options.qualityThresholds?.confidence ?? 70
        ),
        new CostAwareTermination(options.maxCostUsd ?? 5.0),
        new TimeBasedTermination(options.maxDurationMs ?? 300000),
        new AdaptiveTermination()
      ]

      const orchestrator = new ResearchLoopOrchestrator(terminationStrategies)
      const result = await orchestrator.execute(ctx, sessionId, topic, options.maxIterations ?? 5)

      return result
    }
  }
})
```

---

## Migration Path

### Step 1: Extract Phase Functions (Non-breaking)
- Extract SEARCH, SYNTHESIZE, REVIEW, REFINE into separate functions
- Keep runRalphLoop calling them (no API changes)
- Add tests for individual phases

### Step 2: Add State Machine (Non-breaking)
- Add LoopState type
- Refactor runRalphLoop to use LoopState internally
- Keep API unchanged

### Step 3: Add Termination Strategies (Non-breaking)
- Implement QualityBasedTermination (current logic)
- Add as optional parameter to runRalphLoop
- Default to current behavior

### Step 4: Add New Orchestrator (Additive)
- Implement ResearchLoopOrchestrator
- Add new action startResearchWithStrategy
- Keep existing actions for backwards compatibility

### Step 5: Deprecate Old API (Breaking)
- Mark startDeepResearch as deprecated
- Update MCP server to use startResearchWithStrategy
- Add deprecation warnings

---

## Benefits

### Testability
- Each phase can be unit tested independently
- Termination strategies can be tested in isolation
- Mock state for integration tests

### Extensibility
- Easy to add new phases (e.g., "VALIDATE", "ENRICH")
- Pluggable termination strategies
- Custom phase executors

### Observability
- Clear state machine transitions
- Metrics at each phase
- Gap resolution tracking
- Confidence improvement tracking

### Cost Control
- Cost-aware termination
- Diminishing returns detection
- Time budget management

### Flexibility
- Fast path for simple queries
- Deep path for complex research
- Adaptive path for smart routing
- Custom strategies via API

---

## Implementation Priority

### P0 (Must Have)
1. Extract phase functions
2. Add LoopState type
3. Implement QualityBasedTermination
4. Basic ResearchLoopOrchestrator

### P1 (Should Have)
1. CostAwareTermination
2. TimeBasedTermination
3. Gap resolution tracking
4. Checkpoint/resume support

### P2 (Nice to Have)
1. AdaptiveTermination
2. CompositeTermination
3. Confidence improvement tracking
4. Learning from historical data

---

## Alternative: Keep It Simple

If the above is too complex, here's a simpler improvement:

### Minimal Refactor

```typescript
// Just extract the loop condition logic
interface TerminationCriteria {
  maxIterations: number
  minCoverage: number
  minConfidence: number
  maxCostUsd?: number
  maxDurationMs?: number
}

function shouldContinueResearch(
  iteration: number,
  metrics: LoopMetrics,
  criteria: TerminationCriteria
): { continue: boolean; reason: string } {
  if (iteration >= criteria.maxIterations) {
    return { continue: false, reason: "Max iterations reached" }
  }

  if (metrics.coverage >= criteria.minCoverage &&
      metrics.confidence >= criteria.minConfidence) {
    return { continue: false, reason: "Quality thresholds met" }
  }

  if (criteria.maxCostUsd && metrics.costUsd >= criteria.maxCostUsd) {
    return { continue: false, reason: "Cost limit reached" }
  }

  if (criteria.maxDurationMs && metrics.durationMs >= criteria.maxDurationMs) {
    return { continue: false, reason: "Time limit reached" }
  }

  return { continue: true, reason: "" }
}

// Use in runRalphLoop:
while (true) {
  const { continue: shouldContinue, reason } = shouldContinueResearch(
    iteration,
    { coverage: coverageScore, confidence: averageConfidence, costUsd, durationMs },
    criteria
  )

  if (!shouldContinue) {
    console.log(`[runRalphLoop] Stopping: ${reason}`)
    break
  }

  // ... rest of loop
}
```

This is a 50-line change that provides:
- Testable termination logic
- Configurable thresholds
- Multiple stop conditions
- Clear exit reasons

---

## Recommendation

**Start with Minimal Refactor** (P0):
1. Extract `shouldContinueResearch` function
2. Make thresholds configurable
3. Add cost/time limits
4. Test termination logic

**Then incrementally add** (P1):
1. Extract phase functions
2. Add LoopState
3. Implement basic orchestrator

**Save for later** (P2):
- Adaptive termination
- Historical learning
- Complex composite strategies

This gives immediate benefits without risky rewrites.
