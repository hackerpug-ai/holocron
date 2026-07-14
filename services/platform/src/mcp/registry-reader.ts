/**
 * Registry Reader — reads the REAL tool IDs from holocron-mcp/src/mastra/stdio.ts
 * by parsing createTool({ id: "..." }) calls. NOT a self-referential count of manifest keys.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function defaultRegistryPath(cwd = process.cwd()): string {
  return resolve(cwd, 'holocron-mcp/src/mastra/stdio.ts');
}

const TOOL_ID_PATTERN = /\bcreateTool\s*\(\s*\{[\s\S]*?\bid\s*:\s*["']([^"']+)["']/g;

export function readRegisteredToolIds(registryPath?: string): Set<string> {
  const abs = resolve(registryPath ?? defaultRegistryPath());
  const source = readFileSync(abs, 'utf8');
  const ids = new Set<string>();

  let match: RegExpExecArray | null;
  const re = new RegExp(TOOL_ID_PATTERN);
  match = re.exec(source);
  while (match !== null) {
    if (match[1]) {
      ids.add(match[1]);
    }
    match = re.exec(source);
  }

  return ids;
}
