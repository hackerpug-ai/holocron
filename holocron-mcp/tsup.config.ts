import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "tsup";

// Load PLATFORM_URL from consolidated secrets or root .env.local at build time
// process.cwd() is holocron-mcp when running build
const holocronRoot = resolve(process.cwd(), "..");
const envLocalPath = join(holocronRoot, ".env.local");
const secretsPath = join(holocronRoot, "services/platform/config/secrets.yaml");

let PLATFORM_URL = "";
function tryLoadPlatformUrl(filePath: string, pattern: RegExp): void {
  if (PLATFORM_URL) return;
  try {
    const envContent = readFileSync(filePath, "utf-8");
    const match = envContent.match(pattern);
    if (match) {
      PLATFORM_URL = match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional file
  }
}

tryLoadPlatformUrl(secretsPath, /^PLATFORM_URL:\s*(.+)$/m);
tryLoadPlatformUrl(envLocalPath, /^PLATFORM_URL=(.+)$/m);
tryLoadPlatformUrl(envLocalPath, /^EXPO_PUBLIC_PLATFORM_URL=(.+)$/m);

if (!PLATFORM_URL) {
  console.warn("Warning: Could not load PLATFORM_URL from secrets.yaml or .env.local");
}

console.log(`[Build] Injecting PLATFORM_URL: ${PLATFORM_URL}`);

export default defineConfig({
  entry: ["src/mastra/stdio.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  shims: true,
  outDir: "dist",
  define: {
    "process.env.PLATFORM_URL": JSON.stringify(PLATFORM_URL),
    "process.env.EXPO_PUBLIC_PLATFORM_URL": JSON.stringify(PLATFORM_URL),
  },
});
