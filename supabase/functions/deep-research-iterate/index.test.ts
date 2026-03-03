/**
 * Unit tests for deep-research-iterate Edge Function
 *
 * @see US-057 - Deep Research Iteration Streaming
 */

import {
  searchIteration,
  reviewFindings,
} from './index.ts'

// ============================================================
// Test: searchIteration
// ============================================================

Deno.test('searchIteration: returns findings and refined queries', async () => {
  const result = await searchIteration('quantum computing', ['quantum computing basics'], 1)

  if (!result.findings) {
    throw new Error('Expected findings to be returned')
  }
  if (!result.refinedQueries || !Array.isArray(result.refinedQueries)) {
    throw new Error('Expected refinedQueries to be an array')
  }
  if (!result.findings.includes('Iteration 1')) {
    throw new Error('Expected findings to include iteration number')
  }
})

Deno.test('searchIteration: returns empty refined queries on later iterations', async () => {
  const result = await searchIteration('quantum computing', ['query 1', 'query 2'], 5)

  if (!result.refinedQueries || result.refinedQueries.length !== 0) {
    throw new Error('Expected empty refinedQueries on iteration 5')
  }
})

Deno.test('searchIteration: returns non-empty refined queries on early iterations', async () => {
  const result = await searchIteration('quantum computing', ['query 1'], 2)

  if (!result.refinedQueries || result.refinedQueries.length === 0) {
    throw new Error('Expected non-empty refinedQueries on iteration 2')
  }
})

// ============================================================
// Test: reviewFindings
// ============================================================

Deno.test('reviewFindings: returns coverage score between 1 and 5', async () => {
  const result = await reviewFindings('Some findings', 1)

  if (typeof result.coverageScore !== 'number') {
    throw new Error('Expected coverageScore to be a number')
  }
  if (result.coverageScore < 1 || result.coverageScore > 5) {
    throw new Error(`Expected coverageScore between 1 and 5, got ${result.coverageScore}`)
  }
})

Deno.test('reviewFindings: returns feedback string', async () => {
  const result = await reviewFindings('Some findings', 1)

  if (typeof result.feedback !== 'string') {
    throw new Error('Expected feedback to be a string')
  }
  if (result.feedback.length === 0) {
    throw new Error('Expected feedback to be non-empty')
  }
})

Deno.test('reviewFindings: coverage increases with iteration number', async () => {
  const result1 = await reviewFindings('Findings', 1)
  const result3 = await reviewFindings('Findings', 3)

  if (result3.coverageScore <= result1.coverageScore) {
    throw new Error('Expected coverage to increase with iteration number')
  }
})

Deno.test('reviewFindings: returns refined queries when coverage < 4', async () => {
  const result = await reviewFindings('Findings', 1)

  if (result.coverageScore < 4) {
    if (!result.refinedQueries || !Array.isArray(result.refinedQueries)) {
      throw new Error('Expected refinedQueries array when coverage < 4')
    }
    if (result.refinedQueries.length === 0) {
      throw new Error('Expected non-empty refinedQueries when coverage < 4')
    }
  }
})

Deno.test('reviewFindings: returns empty refined queries when coverage >= 4', async () => {
  const result = await reviewFindings('Findings', 5)

  if (result.coverageScore >= 4) {
    if (!result.refinedQueries || result.refinedQueries.length !== 0) {
      throw new Error('Expected empty refinedQueries when coverage >= 4')
    }
  }
})

Deno.test('reviewFindings: indicates complete coverage when score >= 4', async () => {
  const result = await reviewFindings('Findings', 5)

  if (result.coverageScore >= 4) {
    if (!result.feedback.includes('complete') && !result.feedback.includes('Coverage complete')) {
      throw new Error('Expected feedback to indicate completion when coverage >= 4')
    }
  }
})
