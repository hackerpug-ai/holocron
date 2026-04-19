import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  CONVEX_URL: z.string().url(),
  CONVEX_DEPLOY_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

type Env = z.infer<typeof EnvSchema>;

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\$\{[A-Z0-9_]+\}$/.test(trimmed)) return undefined;

  return trimmed;
}

export function loadEnv(): Env {
  const KEYS_TO_MERGE = [
    "HOLOCRON_URL", // Convex deployment URL
    "HOLOCRON_DEPLOY_KEY", // Convex admin/deploy key
    "HOLOCRON_OPENAI_API_KEY", // OpenAI API key (holocron-namespaced)
    "HOLOCRON_SITE_URL", // Convex site URL for HTTP actions
    "CONVEX_URL", // Direct Convex URL override
    "EXPO_PUBLIC_CONVEX_URL", // Holocron app env fallback
    "CONVEX_SITE_URL", // Direct Convex site URL override
    "OPENAI_API_KEY", // OpenAI API key (standard name)
    "EXPO_PUBLIC_OPENAI_API_KEY", // Holocron app env fallback
    "LOG_LEVEL",
  ] as const;

  const candidateRoots = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "../.."),
    resolve(dirname(new URL(import.meta.url).pathname), "../.."),
    resolve(dirname(new URL(import.meta.url).pathname), "../../.."),
  ];

  const projectRoot =
    candidateRoots.find((candidate) => {
      return existsSync(join(candidate, ".env.local")) || existsSync(join(candidate, ".env"));
    }) ?? process.cwd();

  const loadEnvFile = (filePath: string) => {
    if (!existsSync(filePath)) return;

    const contents = readFileSync(filePath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!KEYS_TO_MERGE.includes(key as (typeof KEYS_TO_MERGE)[number])) continue;
      if (process.env[key] !== undefined) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      const normalizedValue = normalizeEnvValue(value);
      if (normalizedValue !== undefined) {
        process.env[key] = normalizedValue;
      }
    }
  };

  // Merge launcher-provided environment first, then fall back to local env files.
  for (const key of KEYS_TO_MERGE) {
    const value = normalizeEnvValue(Bun.env[key]);
    if (value !== undefined && normalizeEnvValue(process.env[key]) === undefined) {
      process.env[key] = value;
    }
  }

  const envPath = join(projectRoot, ".env");
  const envLocalPath = join(projectRoot, ".env.local");
  loadEnvFile(envPath);
  loadEnvFile(envLocalPath);

  const envWithFallback = {
    ...process.env,
    CONVEX_DEPLOY_KEY: normalizeEnvValue(process.env.HOLOCRON_DEPLOY_KEY) || "",
    OPENAI_API_KEY:
      normalizeEnvValue(process.env.HOLOCRON_OPENAI_API_KEY) ||
      normalizeEnvValue(process.env.OPENAI_API_KEY) ||
      normalizeEnvValue(process.env.EXPO_PUBLIC_OPENAI_API_KEY) ||
      "",
    CONVEX_URL:
      normalizeEnvValue(process.env.HOLOCRON_URL) ||
      normalizeEnvValue(process.env.CONVEX_URL) ||
      normalizeEnvValue(process.env.EXPO_PUBLIC_CONVEX_URL) ||
      "",
  };

  const parsed = EnvSchema.safeParse(envWithFallback);

  if (!parsed.success) {
    console.error("Environment validation failed:", parsed.error.format());
    console.error(`Looking for .env in: ${projectRoot}`);
    console.error(`Checked .env at: ${envPath}`);
    console.error(`Checked .env.local at: ${envLocalPath}`);
    console.error(
      `Available CONVEX vars: CONVEX_URL=${process.env.CONVEX_URL}, EXPO_PUBLIC_CONVEX_URL=${process.env.EXPO_PUBLIC_CONVEX_URL}`
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
