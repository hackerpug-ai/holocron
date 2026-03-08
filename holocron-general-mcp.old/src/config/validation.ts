/**
 * Configuration validation
 */

import { HolocronConfig } from './env.js';

export function validateConfig(config: HolocronConfig): void {
  // Validate Convex URL format
  if (!config.convexUrl.startsWith('https://')) {
    throw new Error(
      `Invalid CONVEX_URL: ${config.convexUrl}\n` +
        'Must start with https:// (e.g., https://[deployment].convex.cloud)'
    );
  }

  if (!config.convexUrl.includes('.convex.cloud')) {
    console.error(
      `[warning] CONVEX_URL doesn't include .convex.cloud: ${config.convexUrl}`
    );
  }

  // Validate OpenAI API key format
  if (!config.openaiApiKey.startsWith('sk-')) {
    throw new Error(
      `Invalid OPENAI_API_KEY format\n` +
        'Must start with sk- (OpenAI API key)'
    );
  }

  console.error('[holocron-general-mcp] Configuration validated successfully');
}
