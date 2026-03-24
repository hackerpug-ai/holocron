/**
 * Assimilation Prompt Builders
 *
 * Constructs prompts for each phase of the assimilation Ralph Loop.
 * Each iteration gets a FRESH context with only distilled notes from prior iterations.
 */

import type { DimensionScores, AssimilationDimension } from "./validators";

// ── Planning Phase (Iteration 0) ─────────────────────────────────────────────

/**
 * Build prompt for iteration 0: analyze repo structure and generate coverage plan
 */
export function buildPlanningPrompt(
  repoStructure: string,
  repositoryName: string,
  profile: string,
  feedback?: string
): string {
  let prompt = `You are analyzing the GitHub repository "${repositoryName}" to create an assimilation coverage plan.

## Repository Structure

${repoStructure.slice(0, 8000)}

## Task

Analyze the repository structure and create a coverage plan for deep analysis across 5 dimensions:
1. **Dependencies** — external libraries, package management, version strategy
2. **Architecture** — module organization, data flow, design patterns, boundaries
3. **Patterns** — code conventions, idioms, consistency, naming
4. **Documentation** — README quality, API docs, inline comments, onboarding
5. **Testing** — test coverage, test quality, CI/CD setup, test organization

## Output Format

Respond with a JSON object:
{
  "planContent": "# Assimilation Plan for {repo}\\n\\n## Repository Overview\\n{2-3 sentence overview}\\n\\n## Dimensions\\n\\n### 1. Dependencies\\n{what to analyze, key files}\\n\\n### 2. Architecture\\n{what to analyze, key directories}\\n\\n### 3. Patterns\\n{what to analyze, notable patterns seen}\\n\\n### 4. Documentation\\n{what to analyze, docs found}\\n\\n### 5. Testing\\n{what to analyze, test directories}\\n\\n## Estimate\\n- Profile: ${profile}\\n- Estimated iterations: {N}\\n- Key files to examine: {list}",
  "planSummary": "5 dimensions, {N} iterations, ${profile} profile",
  "coveragePlan": {
    "dimensions": [
      { "name": "dependencies", "keyFiles": ["package.json", "go.mod", etc.], "priority": 1 },
      { "name": "architecture", "keyFiles": ["src/", "lib/", etc.], "priority": 2 },
      { "name": "patterns", "keyFiles": ["src/main", etc.], "priority": 3 },
      { "name": "documentation", "keyFiles": ["README.md", "docs/", etc.], "priority": 4 },
      { "name": "testing", "keyFiles": ["test/", "__tests__/", etc.], "priority": 5 }
    ],
    "primaryLanguage": "{detected language}",
    "repoSize": "small|medium|large"
  }
}`;

  if (feedback) {
    prompt += `\n\n## User Feedback on Previous Plan\n\nThe user reviewed the previous plan and provided this feedback. Adjust the plan accordingly:\n\n"${feedback}"`;
  }

  return prompt;
}

// ── Analysis Phase (Iterations 1+) ───────────────────────────────────────────

/**
 * Build prompt for a single analysis iteration.
 * This is the "fresh context" — only distilled notes + current focus.
 */
export function buildAnalysisPrompt(
  repositoryName: string,
  dimension: string,
  accumulatedNotes: string,
  coveragePlan: unknown,
  dimensionScores: DimensionScores,
  failureConstraints: string[],
  steeringNote?: string,
  repoContent?: string
): string {
  const currentScore = dimensionScores[dimension as AssimilationDimension] ?? 0;

  let prompt = `You are analyzing the GitHub repository "${repositoryName}".

## Current Focus: ${dimension.toUpperCase()}

Analyze the "${dimension}" dimension of this repository in depth.

## Prior Findings (Distilled Notes)

${accumulatedNotes || "No prior findings yet — this is the first analysis iteration."}

## Current Dimension Scores

${Object.entries(dimensionScores)
  .map(([d, s]) => `- ${d}: ${s}/100${d === dimension ? " ← CURRENT FOCUS" : ""}`)
  .join("\n")}

## Coverage Plan Context

${typeof coveragePlan === "object" ? JSON.stringify(coveragePlan, null, 2) : "No coverage plan available."}`;

  if (failureConstraints.length > 0) {
    prompt += `\n\n## Constraints (Avoid These)\n\n${failureConstraints.map((c) => `- ${c}`).join("\n")}`;
  }

  if (steeringNote) {
    prompt += `\n\n## Human Steering Note\n\n${steeringNote}`;
  }

  if (repoContent) {
    prompt += `\n\n## Repository Content\n\n${repoContent.slice(0, 12000)}`;
  }

  prompt += `\n\n## Output Format

Respond with a JSON object:
{
  "findings": "Detailed markdown findings for the ${dimension} dimension (500-2000 words). Include specific file paths, code patterns, and observations.",
  "notesContribution": "Distilled 2-4 sentence summary of KEY new findings for future iterations (200-500 chars max). Focus on what's most important for understanding this repo.",
  "dimensionCoverageScore": ${currentScore > 0 ? `{updated score 0-100, was ${currentScore}}` : "{new score 0-100}"},
  "gaps": ["specific gap 1", "specific gap 2"],
  "summary": "3-6 word summary label"
}`;

  return prompt;
}

// ── Evaluation Phase ─────────────────────────────────────────────────────────

/**
 * Build prompt for the lightweight evaluator (zaiFlash).
 * Assesses novelty and picks the next dimension.
 */
export function buildEvaluationPrompt(
  findings: string,
  accumulatedNotes: string,
  dimensionScores: DimensionScores,
  currentDimension: string
): string {
  return `You are evaluating the progress of a repository analysis.

## Latest Findings (${currentDimension})

${findings.slice(0, 3000)}

## Accumulated Notes

${accumulatedNotes.slice(0, 2000)}

## Dimension Scores

${Object.entries(dimensionScores)
  .map(([d, s]) => `- ${d}: ${s}/100`)
  .join("\n")}

## Task

Assess the novelty and coverage of the latest iteration, then recommend the next action.

Respond with JSON:
{
  "noveltyScore": {0-100, how much NEW information was found compared to what we already knew},
  "shouldContinue": {true/false},
  "nextDimension": "{lowest scoring dimension that could benefit from more analysis, or null}",
  "reason": "{1 sentence explaining the recommendation}",
  "trigger": "needs_dimension|needs_depth|quality_met|all_saturated"
}`;
}

// ── Synthesis Phase ──────────────────────────────────────────────────────────

/**
 * Build prompt for final synthesis into assimilation report.
 */
export function buildSynthesisPrompt(
  repositoryName: string,
  allFindings: string[],
  accumulatedNotes: string,
  dimensionScores: DimensionScores
): string {
  const findingsText = allFindings
    .map((f, i) => `### Iteration ${i + 1}\n\n${f}`)
    .join("\n\n---\n\n");

  return `You are synthesizing the final assimilation report for "${repositoryName}".

## All Iteration Findings

${findingsText.slice(0, 30000)}

## Accumulated Analysis Notes

${accumulatedNotes}

## Final Dimension Scores

${Object.entries(dimensionScores)
  .map(([d, s]) => `- ${d}: ${s}/100`)
  .join("\n")}

## Task

Synthesize ALL findings into a comprehensive, well-structured assimilation report. This is the FINAL output document.

Respond with JSON:
{
  "title": "Assimilation: ${repositoryName}",
  "content": "# Assimilation Report: ${repositoryName}\\n\\n## Executive Summary\\n{3-5 sentences}\\n\\n## Architecture\\n{detailed findings}\\n\\n## Code Patterns & Conventions\\n{detailed findings}\\n\\n## Documentation\\n{detailed findings}\\n\\n## Dependencies & Ecosystem\\n{detailed findings}\\n\\n## Testing & Quality\\n{detailed findings}\\n\\n## Sophistication Ratings\\n{table of ratings}\\n\\n## Key Takeaways\\n{prioritized actionable insights}\\n\\n## Anti-Patterns to Avoid\\n{what NOT to copy}",
  "trackRatings": {
    "architecture": {1-5 integer},
    "patterns": {1-5 integer},
    "documentation": {1-5 integer},
    "dependencies": {1-5 integer},
    "testing": {1-5 integer}
  },
  "sophisticationRating": {1-5 integer, overall},
  "primaryLanguage": "{detected primary language}"
}`;
}
