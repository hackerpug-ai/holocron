/**
 * S31-MCP-01 — strict dual-transport MCP tool-sweep predicate.
 *
 * A tool invocation is a success only when there is no JSON-RPC error, the tool
 * result is not `isError: true`, and the payload (structuredContent or parsed
 * text content) passes the tool's shared output schema. Schema validation runs
 * unconditionally — never gated on `isError`.
 *
 * The external-dependency allowlist is asserted by value in the sweep suite
 * (R35). Do not widen it to paper over Postgres-backed tool failures.
 */

export type SweepFailureReason =
  | 'jsonrpc_error'
  | 'tool_is_error'
  | 'output_schema_mismatch'
  | 'http_status'
  | 'missing_result';

export type SweepAllowlistEntry = {
  readonly id: string;
  readonly reason: string;
};

/**
 * Tools that cannot succeed without a live third-party credential/API (R35).
 * Contents are asserted by deep-equal in the sweep suite — do not grow silently.
 */
export const SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST = [
  {
    id: 'findRecommendations',
    reason:
      'live third-party search API dependency — vendor outage can redden the cutover gate for reasons unrelated to the migration (R35)',
  },
  {
    id: 'shop_products',
    reason:
      'live third-party retailer search API dependency — vendor outage can redden the cutover gate for reasons unrelated to the migration (R35)',
  },
] as const satisfies readonly SweepAllowlistEntry[];

export const SWEEP_ALLOWLISTED_TOOL_IDS: ReadonlySet<string> = new Set(
  SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST.map((entry) => entry.id)
);

export type SweepToolResultEnvelope = {
  error?: unknown;
  result?: {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ text?: string; type?: string }>;
  };
};

export type SweepOutputSchema = {
  safeParse: (value: unknown) => { success: boolean };
};

export type ClassifySweepToolResultInput = {
  /** HTTP status when the transport is Streamable HTTP; omit for stdio. */
  status?: number;
  body: SweepToolResultEnvelope;
  outputSchema?: SweepOutputSchema;
  transport: 'http' | 'stdio';
};

export type ClassifySweepToolResultOutput = {
  ok: boolean;
  reasons: SweepFailureReason[];
};

export type SweepFailureRecord = {
  id: string;
  transport: 'http' | 'stdio';
  status?: number;
  reason: SweepFailureReason;
  reasons: SweepFailureReason[];
};

/**
 * Extract the tool payload for schema validation.
 * Prefer structuredContent; fall back to JSON-parsed text content (array-shaped
 * outputs are only present in text content per gateway.ts).
 */
function extractPayload(result: NonNullable<SweepToolResultEnvelope['result']>): unknown {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = result.content?.[0]?.text;
  if (typeof text === 'string' && text.length > 0) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return undefined;
}

/**
 * Strict classifier shared by both Streamable HTTP and stdio 44-tool sweeps.
 *
 * Failure classes (evaluated unconditionally; schema is never skipped on isError):
 * - jsonrpc_error: body.error is present
 * - tool_is_error: body.result.isError === true
 * - output_schema_mismatch: safeParse fails on structuredContent ?? JSON.parse(text)
 * - http_status: non-200 HTTP status (HTTP transport only)
 * - missing_result: neither error nor result present
 */
export function classifySweepToolResult(
  input: ClassifySweepToolResultInput
): ClassifySweepToolResultOutput {
  const reasons: SweepFailureReason[] = [];

  if (input.transport === 'http' && input.status !== undefined && input.status !== 200) {
    reasons.push('http_status');
  }

  const hasError = input.body.error !== undefined && input.body.error !== null;
  if (hasError) {
    reasons.push('jsonrpc_error');
  }

  const result = input.body.result;
  if (!result) {
    if (!hasError) {
      reasons.push('missing_result');
    }
    return { ok: reasons.length === 0, reasons };
  }

  if (result.isError === true) {
    reasons.push('tool_is_error');
  }

  // Schema check runs unconditionally — no isError guard (R35/R36 teeth).
  if (input.outputSchema) {
    const payload = extractPayload(result);
    const parsed = input.outputSchema.safeParse(payload);
    if (!parsed.success) {
      reasons.push('output_schema_mismatch');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function isSweepAllowlisted(toolId: string): boolean {
  return SWEEP_ALLOWLISTED_TOOL_IDS.has(toolId);
}

export function sortedSweepAllowlistIds(): string[] {
  return SWEEP_EXTERNAL_DEPENDENCY_ALLOWLIST.map((entry) => entry.id).sort();
}
