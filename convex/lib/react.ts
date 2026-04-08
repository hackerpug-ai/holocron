"use node";

/**
 * ReAct Pattern Wrapper
 *
 * Composable module that adds ReAct (Reasoning + Acting) structure to any
 * generateText call. Drop-in replacement for the Vercel AI SDK's generateText:
 *
 *   import { generateTextWithReAct } from "../lib/react";
 *   const result = await generateTextWithReAct({ model, system, messages, tools });
 *
 * Two things this module does:
 *   1. Injects REACT_INSTRUCTIONS into the system prompt — requires the model
 *      to produce a <thought> block before every tool call, grounding decisions
 *      in what's already in context.
 *   2. Transforms messages matching the context.ts tool result format into
 *      "Observation (tool_name):" entries — gives the model an unambiguous
 *      signal that the content is evidence from a tool, not model-generated text.
 */

import { generateText } from "ai";

/**
 * ReAct system prompt fragment.
 * Prepended to the agent's own system prompt so it takes priority.
 */
export const REACT_INSTRUCTIONS = `## Reasoning Before Tool Use (ReAct Pattern)

Before calling any tool, output a <thought> block:

<thought>
Goal: [what the user needs]
Context: [relevant information already in the conversation]
Gap: [what new information is required that isn't already here]
Tool: [which tool and why]
</thought>

Only call a tool when the <thought> reveals a genuine gap. If the answer is already in context, respond with text — no tool call needed.
`;

/**
 * Injects ReAct instructions into a system prompt string.
 * The ReAct block is prepended so it takes precedence over formatting rules below it.
 */
export function withReActPrompt(systemPrompt: string): string {
  return `${REACT_INSTRUCTIONS}\n${systemPrompt}`;
}

/**
 * Transforms assistant messages that match the context.ts tool result format:
 *   "[I used the X tool with args Y]\n\nResults:\n{content}"
 * into the cleaner ReAct observation format:
 *   "Observation (x_tool):\n{content}"
 *
 * This helps the model clearly distinguish evidence retrieved from tools
 * from text it generated itself, reducing hallucination in reasoning steps.
 */
export function transformObservations(messages: any[]): any[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant" || typeof msg.content !== "string") return msg;

    const match = msg.content.match(
      /^\[I used the (.+?) tool[^\]]*\]\n\nResults:\n([\s\S]*)$/
    );
    if (!match) return msg;

    const toolName = match[1].toLowerCase().replace(/\s+/g, "_");
    const resultContent = match[2];
    return { ...msg, content: `Observation (${toolName}):\n${resultContent}` };
  });
}

/**
 * Drop-in replacement for generateText that adds ReAct structure.
 *
 * Usage:
 *   const result = await generateTextWithReAct({
 *     model: specialist.model(),
 *     system: specialist.systemPrompt,
 *     messages,
 *     tools: specialist.tools,
 *   });
 */
export async function generateTextWithReAct(
  params: Parameters<typeof generateText>[0]
): Promise<Awaited<ReturnType<typeof generateText>>> {
  const p = params as Record<string, unknown>;

  // Inject ReAct instructions into the system prompt (string only; other formats pass through).
  const system =
    typeof p["system"] === "string"
      ? withReActPrompt(p["system"])
      : (p["system"] ?? REACT_INSTRUCTIONS);

  // Transform tool-result messages to Observation format when a messages array is present.
  const messages = Array.isArray(p["messages"])
    ? transformObservations(p["messages"])
    : p["messages"];

  return generateText({ ...params, system, messages } as Parameters<typeof generateText>[0]);
}
