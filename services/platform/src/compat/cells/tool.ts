/**
 * Cell 2 — Tool
 *
 * Creates one Mastra Tool with a Zod outputSchema, calls
 * tool.execute(inputData, context), and asserts the return is
 * runtime-validated against the schema.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const inputSchema = z.object({
  value: z.string().min(1),
});

const outputSchema = z.object({
  echoed: z.string(),
  length: z.number().int().nonnegative(),
  processedAt: z.string(),
});

export const compatEchoTool = createTool({
  id: 'compat-echo',
  description: 'Echoes the input value with metadata — used by the compatibility spike.',
  inputSchema,
  outputSchema,
  execute: async (inputData) => {
    // 1.x two-positional-arg signature: (inputData, context)
    const value = inputData.value;
    return {
      echoed: `echo:${value}`,
      length: value.length,
      processedAt: new Date().toISOString(),
    };
  },
});

export interface ToolCellResult {
  ok: boolean;
  output?: { echoed: string; length: number; processedAt: string };
  error?: string;
}

export async function runToolCell(): Promise<ToolCellResult> {
  try {
    // Real execute call — inputData as first positional arg
    const result = await compatEchoTool.execute(
      { value: 'compatibility-spike' },
      // context (2nd positional arg) — empty but real
      {}
    );

    // Runtime validation: outputSchema.parse must succeed
    const validated = outputSchema.parse(result);

    return { ok: true, output: validated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
