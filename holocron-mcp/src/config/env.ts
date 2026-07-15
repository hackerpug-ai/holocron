import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/**
 * MCP env — reads PLATFORM_URL (and related) from process env / .env files.
 * Do not reintroduce legacy Convex deployment env aliases (T-PLAT-017).
 */
const EnvSchema = z.object({
  PLATFORM_URL: z.string().url(),
  HOLO_DEPLOY_KEY: z.string().optional(),
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
    "PLATFORM_URL", // Platform / MCP backend base URL (consolidated secrets)
    "PLATFORM_SITE_URL", // Public site URL for HTTP share links
    "HOLO_DEPLOY_KEY", // Optional deploy/admin key
    "HOLOCRON_OPENAI_API_KEY", // OpenAI API key (holocron-namespaced)
    "OPENAI_API_KEY", // OpenAI API key (standard name)
    "EXPO_PUBLIC_OPENAI_API_KEY", // Holocron app env fallback
    "EXPO_PUBLIC_PLATFORM_URL", // App-public platform URL fallback
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

  // Also try consolidated secrets.yaml (flat KEY: value) if present
  const secretsCandidates = [
    join(projectRoot, "services/platform/config/secrets.yaml"),
    resolve(projectRoot, "../services/platform/config/secrets.yaml"),
    resolve(projectRoot, "services/platform/config/secrets.yaml"),
  ];
  for (const secretsPath of secretsCandidates) {
    if (!existsSync(secretsPath)) continue;
    const contents = readFileSync(secretsPath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      if (!KEYS_TO_MERGE.includes(key as (typeof KEYS_TO_MERGE)[number]) && key !== "PLATFORM_URL")
        continue;
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
    break;
  }

  const envWithFallback = {
    ...process.env,
    HOLO_DEPLOY_KEY: normalizeEnvValue(process.env.HOLO_DEPLOY_KEY) || "",
    OPENAI_API_KEY:
      normalizeEnvValue(process.env.HOLOCRON_OPENAI_API_KEY) ||
      normalizeEnvValue(process.env.OPENAI_API_KEY) ||
      normalizeEnvValue(process.env.EXPO_PUBLIC_OPENAI_API_KEY) ||
      "",
    PLATFORM_URL:
      normalizeEnvValue(process.env.PLATFORM_URL) ||
      normalizeEnvValue(process.env.EXPO_PUBLIC_PLATFORM_URL) ||
      "",
  };

  const parsed = EnvSchema.safeParse(envWithFallback);

  if (!parsed.success) {
    console.error("Environment validation failed:", parsed.error.format());
    console.error(`Looking for .env in: ${projectRoot}`);
    console.error(`Checked .env at: ${envPath}`);
    console.error(`Checked .env.local at: ${envLocalPath}`);
    console.error(
      `Available platform vars: PLATFORM_URL=${process.env.PLATFORM_URL}, EXPO_PUBLIC_PLATFORM_URL=${process.env.EXPO_PUBLIC_PLATFORM_URL}`
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
