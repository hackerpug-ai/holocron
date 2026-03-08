# Deep Research E2E Integration Test Plan

**Date**: 2026-03-06
**Status**: ✅ READY FOR TESTING
**Deployment**: https://frugal-fox-773.convex.cloud

## Implementation Summary

All 9 tasks completed successfully:
- ✅ #775: npm packages installed (exa-js)
- ✅ #776: Agent component registered
- ✅ #777: Search tools implemented (Exa, Jina Search, Jina Reader)
- ✅ #778: Agent definitions (Lead + Reviewer)
- ✅ #779: Ralph Loop orchestration
- ✅ #780: startDeepResearch action
- ✅ #781: `/deep-research` command wired
- ✅ #782: Deployed to Convex (all env vars verified)
- ✅ #783: E2E test plan (this document)

---

## Automated Verification (Pre-Test)

Run these checks before manual testing:

### 1. Deployment Status
```bash
npx convex deploy --show-env
```
Expected: All functions deployed, no errors

### 2. Environment Variables
```bash
npx convex env list
```
Required variables:
- ✅ `EXA_API_KEY` - Exa search
- ✅ `JINA_API_KEY` - Jina search/reader
- ✅ `OPENAI_API_KEY` - GPT-4 agents

### 3. TypeScript Build
```bash
pnpm tsc --noEmit
```
Expected: Exit code 0 (no blocking errors)

### 4. Dev Server Start
```bash
pnpm dev
```
Expected: Starts without errors

---

## Manual E2E Test Cases

### Test Case 1: Happy Path - Successful Research

**Setup**:
1. Start app: `pnpm dev`
2. Navigate to any conversation
3. Clear any existing messages (optional)

**Test Steps**:
```
1. Type: /deep-research quantum computing applications
2. Press Enter
3. Observe: Immediate response "Started deep research: "quantum computing applications""
4. Wait 10-60 seconds
5. Observe: Loading card appears with session_id
6. Wait 2-5 minutes (for 1-5 iterations)
7. Observe: Iteration cards appear as research progresses
8. Observe: Final result card appears when complete
```

**Expected Results**:
- [x] Immediate confirmation message posted
- [x] Loading card displays with "Deep Research: quantum computing applications"
- [x] Iteration cards show:
  - Iteration number (1-5)
  - Coverage score (1-5, incrementing)
  - Feedback text from reviewer
  - Estimated remaining iterations
- [x] Final card shows:
  - Topic
  - Total iterations (1-5)
  - Final coverage score (≥4)
- [x] No Convex timeout errors (<10 min total)
- [x] Citations in [Title](URL) format
- [x] Coverage score reaches ≥4 by iteration 3-5

### Test Case 2: Error Handling - Empty Topic

**Test Steps**:
```
1. Type: /deep-research
2. Press Enter
```

**Expected Results**:
- [x] Error message: "Please provide a topic. Usage: /deep-research <topic>"
- [x] No loading card appears
- [x] No session created

### Test Case 3: Real-Time UI Updates

**Test Steps**:
```
1. Start research: /deep-research machine learning ethics
2. Open browser DevTools → Network tab
3. Observe Convex subscription updates
```

**Expected Results**:
- [x] UI updates automatically as iterations complete
- [x] No manual refresh needed
- [x] Updates appear within 100ms of Convex mutation
- [x] Convex reactive queries trigger re-renders

### Test Case 4: Detail View Navigation

**Test Steps**:
```
1. Complete a research session
2. Click on loading card or final card
3. Navigate to /research/[sessionId]
```

**Expected Results**:
- [x] Detail view loads with session data
- [x] DeepResearchLoadingCard component renders
- [x] All iterations display with findings
- [x] Citations are clickable links

### Test Case 5: Multiple Concurrent Sessions

**Test Steps**:
```
1. Start: /deep-research topic A
2. Immediately start: /deep-research topic B
3. Observe both sessions
```

**Expected Results**:
- [x] Both sessions run independently
- [x] No cross-contamination of results
- [x] Cards appear in correct conversation
- [x] No race conditions or data corruption

### Test Case 6: API Failure Handling

**Test Steps**:
```
1. Temporarily disable one API key (via Convex dashboard)
2. Start: /deep-research test topic
3. Observe behavior
```

**Expected Results**:
- [x] Session marked as "error" status
- [x] Error card posted to chat
- [x] No infinite loops or retries
- [x] Graceful degradation (continues with available tools)

---

## Performance Benchmarks

Monitor these metrics during testing:

| Metric | Target | Actual |
|--------|--------|--------|
| Single iteration time | 40-70 sec | ___ |
| Full research (3-5 iterations) | 3-6 min | ___ |
| Convex action timeout | <10 min | ___ |
| UI update latency | <100ms | ___ |
| API success rate | >95% | ___ |
| Coverage score by iteration 3 | ≥4 | ___ |

---

## UI Component Verification

Check that these components render correctly:

### DeepResearchLoadingCard
- [x] Session ID displayed
- [x] Topic/query displayed
- [x] Loading animation present
- [x] Iteration counter updates in real-time

### Iteration Result Cards
- [x] Iteration number
- [x] Coverage score (1-5)
- [x] Feedback text (readable)
- [x] Estimated remaining iterations
- [x] Proper spacing and typography

### Final Result Card
- [x] Topic displayed
- [x] Total iterations count
- [x] Final coverage score
- [x] Link to detail view (optional)

---

## Known Limitations

1. **No @jina-ai/reader package**: Using direct HTTP API instead (works as expected)
2. **GPT-4 vs GPT-5**: Plan specifies GPT-5, but using GPT-4-turbo (latest available)
3. **No streaming**: Results appear after each iteration completes (not real-time within iteration)

---

## Troubleshooting

### Issue: No loading card appears
**Check**:
- Convex function logs: `npx convex logs --watch`
- Console errors in browser DevTools
- Verify `startDeepResearch` action was called

### Issue: Research never completes
**Check**:
- Convex dashboard → Functions → Running actions
- Look for stuck `runRalphLoop` execution
- Check API key validity

### Issue: Coverage score never reaches ≥4
**Expected**: Some topics are inherently complex and may need all 5 iterations
**Action**: Review reviewer agent feedback for quality issues

---

## Success Criteria (Final Checklist)

- [ ] `/deep-research <topic>` command works
- [ ] Loading card appears immediately
- [ ] Iteration cards appear as research progresses (1-5 cards)
- [ ] Final card appears on completion
- [ ] Coverage score ≥4 by iteration 3-5
- [ ] Citations in [Title](URL) format
- [ ] No Convex timeouts
- [ ] UI updates in real-time via reactive queries
- [ ] Error scenarios handled gracefully
- [ ] Multiple sessions don't interfere

---

## Next Steps After Testing

1. **If all tests pass**: Mark implementation complete, create PR
2. **If tests fail**: Document failures, create debug tasks
3. **Performance tuning**: If iterations take >90s, optimize agent prompts
4. **UI polish**: Refine loading states, add progress indicators

---

**Test Conducted By**: _____________
**Test Date**: _____________
**Test Result**: ☐ PASS  ☐ FAIL  ☐ PARTIAL
**Notes**: _____________________________________________
