import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export interface HolocronConfig {
  convexUrl: string;
  openaiApiKey: string;
  exaApiKey: string;
  jinaApiKey: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

/**
 * Load configuration from holocron project .env.local first,
 * then fall back to ~/.config/holocron-mcp/.env
 */
export function loadConfig(): HolocronConfig {
  // Try .env.local in current working directory first
  const localEnv = resolve(process.cwd(), '.env.local');

  if (existsSync(localEnv)) {
    console.error(`[holocron-mcp] Loading env from: ${localEnv}`);
    config({ path: localEnv });
  } else {
    // Fall back to global config
    const configDir = resolve(homedir(), '.config', 'holocron-mcp');
    const envPath = resolve(configDir, '.env');

    if (existsSync(envPath)) {
      console.error(`[holocron-mcp] Loading env from: ${envPath}`);
      config({ path: envPath });
    }
  }

  // Validate required environment variables
  // Support both EXPO_PUBLIC_ prefixed and unprefixed versions
  const convexUrl = process.env.CONVEX_URL || process.env.EXPO_PUBLIC_CONVEX_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const exaApiKey = process.env.EXA_API_KEY;
  const jinaApiKey = process.env.JINA_API_KEY;

  if (!convexUrl) {
    throw new Error(
      'CONVEX_URL is required. Create ~/.config/holocron-mcp/.env with CONVEX_URL=https://[deployment].convex.cloud'
    );
  }

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required in ~/.config/holocron-mcp/.env');
  }

  if (!exaApiKey) {
    throw new Error('EXA_API_KEY is required in ~/.config/holocron-mcp/.env');
  }

  if (!jinaApiKey) {
    throw new Error('JINA_API_KEY is required in ~/.config/holocron-mcp/.env');
  }

  return {
    convexUrl,
    openaiApiKey,
    exaApiKey,
    jinaApiKey,
    pollIntervalMs: parseInt(process.env.HOLOCRON_MCP_POLL_INTERVAL || '2000', 10),
    timeoutMs: parseInt(process.env.HOLOCRON_MCP_TIMEOUT || '300000', 10),
  };
}
