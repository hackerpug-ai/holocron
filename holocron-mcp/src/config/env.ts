import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  CONVEX_URL: z.string().url(),
  CONVEX_DEPLOY_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  // Find holocron root directory
  const projectRoot = resolve(import.meta.dir, "../../.."); // holocron-mcp/src/config -> holocron/

  // Explicitly load .env.local if it exists (Bun doesn't auto-load .env.local)
  const envLocalPath = join(projectRoot, ".env.local");
  if (existsSync(envLocalPath)) {
    // Merge only the specific keys required by the MCP server.
    // Spreading all of Bun.env is a security risk — it would expose every
    // environment variable to process.env consumers. Instead, enumerate the
    // exact keys this server needs.
    const KEYS_TO_MERGE = [
      "HOLOCRON_URL", // Convex deployment URL
      "HOLOCRON_DEPLOY_KEY", // Convex admin/deploy key
      "HOLOCRON_OPENAI_API_KEY", // OpenAI API key (holocron-namespaced)
      "HOLOCRON_SITE_URL", // Convex site URL for HTTP actions
      "CONVEX_URL", // Direct Convex URL override
      "CONVEX_SITE_URL", // Direct Convex site URL override
      "OPENAI_API_KEY", // OpenAI API key (standard name)
    ] as const;

    for (const key of KEYS_TO_MERGE) {
      const value = Bun.env[key];
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }

  const envWithFallback = {
    ...process.env,
    CONVEX_DEPLOY_KEY: process.env.HOLOCRON_DEPLOY_KEY || "",
    OPENAI_API_KEY: process.env.HOLOCRON_OPENAI_API_KEY || "",
    CONVEX_URL: process.env.HOLOCRON_URL || "",
  };

  const parsed = EnvSchema.safeParse(envWithFallback);

  if (!parsed.success) {
    console.error("Environment validation failed:", parsed.error.format());
    console.error(`Looking for .env in: ${projectRoot}`);
    console.error(`Checked .env.local at: ${envLocalPath}`);
    console.error(
      `Available CONVEX vars: CONVEX_URL=${process.env.CONVEX_URL}, EXPO_PUBLIC_CONVEX_URL=${process.env.EXPO_PUBLIC_CONVEX_URL}`
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
