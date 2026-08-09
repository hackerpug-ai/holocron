/**
 * Streamable HTTP delegate to the platform MCP gateway (/mcp).
 * Replaces the legacy browser backend client (S31-05 / UC-SVC-04 AC-2).
 *
 * Diagnostics only on stderr — never stdout (stdio is JSON-RPC framing).
 */

export type PlatformMcpClientOptions = {
  platformUrl?: string;
  apiKey?: string;
};

export type CallToolOptions = {
  signal?: AbortSignal;
};

type JsonRpcError = {
  code?: number;
  message?: string;
};

type CallToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
};

type JsonRpcResponse = {
  result?: CallToolResult;
  error?: JsonRpcError;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '');
}

function resolvePlatformUrl(explicit?: string): string {
  const raw =
    explicit ??
    process.env.PLATFORM_URL ??
    process.env.EXPO_PUBLIC_PLATFORM_URL ??
    '';
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('PLATFORM_UNREACHABLE: PLATFORM_URL is not configured');
  }
  return normalizeBaseUrl(trimmed);
}

function resolveApiKey(explicit?: string): string {
  const key =
    explicit ?? process.env.HOLO_KEY_MCP ?? process.env.MCP_API_KEY ?? '';
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('PLATFORM_UNREACHABLE: HOLO_KEY_MCP is not configured');
  }
  return trimmed;
}

/**
 * Thin HTTP client for tools/call against the platform Streamable HTTP gateway.
 * Failures surface as screaming-snake Error messages — never empty-array success.
 */
export class PlatformMcpClient {
  private readonly mcpUrl: string;
  private readonly apiKey: string;

  constructor(options: PlatformMcpClientOptions = {}) {
    this.mcpUrl = `${resolvePlatformUrl(options.platformUrl)}/mcp`;
    this.apiKey = resolveApiKey(options.apiKey);
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
    options: CallToolOptions = {}
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.mcpUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name, arguments: args },
        }),
        signal: options.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `PLATFORM_UNREACHABLE: cannot reach platform at ${this.mcpUrl}: ${message}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `PLATFORM_UNREACHABLE: platform returned HTTP ${response.status} for tools/call ${name}`
      );
    }

    let body: JsonRpcResponse;
    try {
      body = (await response.json()) as JsonRpcResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PLATFORM_ERROR: invalid JSON from platform tools/call: ${message}`);
    }

    if (body.error) {
      throw new Error(
        `PLATFORM_ERROR: ${body.error.message ?? 'unknown JSON-RPC error from tools/call'}`
      );
    }

    const result = body.result;
    if (!result) {
      throw new Error('PLATFORM_ERROR: tools/call omitted result');
    }

    if (result.isError === true) {
      const text = result.content?.[0]?.text ?? '';
      let code = 'INTERNAL_SERVER_ERROR';
      let message = text || 'tool execution failed';
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string };
        if (parsed.code && /^[A-Z][A-Z0-9_]+$/.test(parsed.code)) {
          code = parsed.code;
        }
        if (typeof parsed.message === 'string' && parsed.message.length > 0) {
          message = parsed.message;
        }
      } catch {
        // text may be plain string from upstream
      }
      throw new Error(`${code}: ${message}`);
    }

    if (result.structuredContent !== undefined) {
      return result.structuredContent as T;
    }

    const text = result.content?.[0]?.text;
    if (typeof text === 'string' && text.length > 0) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }

    throw new Error('PLATFORM_ERROR: tools/call returned empty content');
  }

  /** No persistent connection to close (stateless HTTP). */
  close(): void {
    // intentionally empty
  }
}

let singleton: PlatformMcpClient | undefined;

/** Lazy singleton so env is read after process env is fully set. */
export function getPlatformClient(): PlatformMcpClient {
  if (!singleton) {
    singleton = new PlatformMcpClient();
  }
  return singleton;
}

/** Test helper — replace the singleton (e.g. closed-port PLATFORM_URL). */
export function resetPlatformClient(client?: PlatformMcpClient): void {
  singleton = client;
}

/** Convenience: callTool on the singleton. */
export async function callPlatformTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
  options: CallToolOptions = {}
): Promise<T> {
  return getPlatformClient().callTool<T>(name, args, options);
}

export function assertRecordArgs(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) {
    throw new Error('INVALID_ARGUMENT: tool input must be an object');
  }
  return args;
}
