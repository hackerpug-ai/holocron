import { z } from "zod";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

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
    // Bun.env will automatically parse and merge it
    process.env = { ...process.env, ...Bun.env };
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
      `Available CONVEX vars: CONVEX_URL=${process.env.CONVEX_URL}, EXPO_PUBLIC_CONVEX_URL=${process.env.EXPO_PUBLIC_CONVEX_URL}`,
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
