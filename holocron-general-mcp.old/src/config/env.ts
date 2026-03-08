/**
 * Environment configuration loader
 * Reads from ~/.config/holocron-general-mcp/.env
 */

import { config } from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';

export interface HolocronConfig {
  convexUrl: string;
  openaiApiKey: string;
}

/**
 * Load configuration from environment
 * Priority: process.env > ~/.config/holocron-general-mcp/.env
 */
export function loadConfig(): HolocronConfig {
  // Try loading from standard location
  const configPath = join(homedir(), '.config', 'holocron-general-mcp', '.env');
  config({ path: configPath });

  // Fall back to process.env (for testing)
  const convexUrl = process.env.CONVEX_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!convexUrl) {
    throw new Error(
      'CONVEX_URL not found. Create ~/.config/holocron-general-mcp/.env with:\n' +
        'CONVEX_URL=https://[your-deployment].convex.cloud'
    );
  }

  if (!openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY not found. Create ~/.config/holocron-general-mcp/.env with:\n' +
        'OPENAI_API_KEY=sk-xxx'
    );
  }

  return {
    convexUrl,
    openaiApiKey,
  };
}
