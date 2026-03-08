import type { HolocronConfig } from './env.js';

/**
 * Validate configuration values
 */
export function validateConfig(config: HolocronConfig): void {
  // Validate Convex URL format
  if (!config.convexUrl.startsWith('https://') || !config.convexUrl.includes('.convex.cloud')) {
    throw new Error(
      `Invalid CONVEX_URL format: ${config.convexUrl}. Expected https://[deployment].convex.cloud`
    );
  }

  // Validate OpenAI API key format
  if (!config.openaiApiKey.startsWith('sk-')) {
    throw new Error('Invalid OPENAI_API_KEY format. Expected to start with sk-');
  }

  // Validate polling interval (should be reasonable)
  if (config.pollIntervalMs < 1000 || config.pollIntervalMs > 10000) {
    throw new Error(
      `Invalid poll interval: ${config.pollIntervalMs}ms. Should be between 1000-10000ms`
    );
  }

  // Validate timeout (should be reasonable and > poll interval)
  if (config.timeoutMs < config.pollIntervalMs * 2) {
    throw new Error(
      `Timeout (${config.timeoutMs}ms) must be at least 2x poll interval (${config.pollIntervalMs}ms)`
    );
  }

  if (config.timeoutMs > 600000) {
    throw new Error(
      `Timeout (${config.timeoutMs}ms) exceeds maximum allowed (600000ms / 10 minutes)`
    );
  }
}
