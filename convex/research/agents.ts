/**
 * Research Agents for Deep Research Workflow
 *
 * Factory functions for creating research agents:
 * - createLeadAgent: Research coordinator using GPT-4 Turbo
 * - createReviewerAgent: Quality reviewer using GPT-4 Turbo
 */

import { Agent } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { openai } from "@ai-sdk/openai";
import type { GenericActionCtx } from "convex/server";
import type { LanguageModel } from "ai";

/**
 * Create Lead Research Agent
 *
 * The lead agent orchestrates the research process:
 * 1. Plans research with 3-5 queries
 * 2. Executes searches (or delegates to subagents)
 * 3. Synthesizes findings into comprehensive reports
 *
 * @param ctx - Convex action context
 * @returns Configured Agent instance for research coordination
 */
export function createLeadAgent(ctx: GenericActionCtx<any>) {
  return new Agent(components.agent, {
    name: "Lead Research Agent",
    languageModel: openai.chat("gpt-4-turbo") as LanguageModel,
    instructions: `You are a Lead Research Agent coordinating deep research.

Your responsibilities:
1. Plan research with 3-5 focused search queries that cover different aspects of the topic
2. Execute searches systematically to gather comprehensive information
3. Synthesize findings into well-organized, citation-rich reports

Guidelines:
- Use [Title](URL) format for all citations
- Organize information by theme or category
- Identify gaps in coverage and suggest follow-up queries
- Write 500-1000 words per iteration
- Be thorough but concise
- Focus on authoritative sources`,
  });
}

/**
 * Create Reviewer Agent
 *
 * The reviewer agent assesses research quality and coverage:
 * - Scores research comprehensiveness (1-5 scale)
 * - Identifies gaps in coverage
 * - Provides actionable feedback
 * - Decides whether to continue iterating
 *
 * @param ctx - Convex action context
 * @returns Configured Agent instance for quality review
 */
export function createReviewerAgent(ctx: GenericActionCtx<any>) {
  return new Agent(components.agent, {
    name: "Research Quality Reviewer",
    languageModel: openai.chat("gpt-4-turbo") as LanguageModel,
    instructions: `You are a Research Quality Reviewer.

Your task:
Score research coverage on a 1-5 scale:
1 = minimal (single source, major gaps)
2 = basic (few sources, obvious gaps)
3 = adequate (multiple sources, some gaps)
4 = comprehensive (thorough coverage, minor gaps)
5 = complete (exhaustive, no significant gaps)

Output format (JSON):
{
  "coverageScore": number,
  "gaps": string[],
  "feedback": string,
  "shouldContinue": boolean
}

Note: Be strict - only score 4+ when truly comprehensive with authoritative sources and multiple perspectives.`,
  });
}
