#!/usr/bin/env bun
/** Additively copy the verified cutover blob stage into the deployed named volume. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

type InventoryEntry = { path: string; bytes: number; sha256: string };
type DeploymentRecord = {
  containers?: Record<string, string>;
  imageDigest?: string;
  sourceRevision?: string;
};

function option(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
}

function inventory(root: string): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        const bytes = readFileSync(path);
        entries.push({
          path: relative(root, path).replaceAll('\\', '/'),
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  };
  visit(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

const source = resolve(option('--source'));
const recordPath = resolve(option('--record'));
const output = resolve(option('--output'));
const cwd = process.cwd();
const sourceRel = relative(cwd, source).replaceAll('\\', '/');
if (sourceRel.startsWith('../') || !sourceRel.startsWith('.tmp/D06-04/')) {
  throw new Error('blob source must be inside this checkout .tmp/D06-04');
}
if (!existsSync(source) || !statSync(source).isDirectory()) {
  throw new Error(`blob source directory is missing: ${sourceRel}`);
}

const record = JSON.parse(readFileSync(recordPath, 'utf8')) as DeploymentRecord;
const container = record.containers?.mastra ?? '';
if (!/^[a-f0-9]{12,64}$/.test(container)) {
  throw new Error('deployment record lacks exact Mastra container ID');
}

const local = inventory(source);
if (local.length === 0) throw new Error('refuse empty cutover blob inventory');

const copied = spawnSync('docker', ['cp', `${source}/.`, `${container}:/var/lib/holocron/blobs/`], {
  cwd,
  encoding: 'utf8',
  timeout: 120_000,
});
if (copied.status !== 0) {
  throw new Error(`docker cp failed: ${(copied.stderr || copied.stdout).trim()}`);
}

const remoteInventoryProgram = `
  import { createHash } from "node:crypto";
  import { readFileSync, readdirSync } from "node:fs";
  import { relative, resolve } from "node:path";
  const root = "/var/lib/holocron/blobs";
  const out = [];
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const bytes = readFileSync(path);
        out.push({ path: relative(root, path).replaceAll("\\\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      }
    }
  };
  visit(root);
  out.sort((a, b) => a.path.localeCompare(b.path));
  process.stdout.write(JSON.stringify(out));
`;
const inspected = spawnSync('docker', ['exec', container, 'bun', '-e', remoteInventoryProgram], {
  cwd,
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
if (inspected.status !== 0) {
  throw new Error(`deployed blob inventory failed: ${(inspected.stderr || inspected.stdout).trim()}`);
}
const remote = JSON.parse(inspected.stdout) as InventoryEntry[];
const remoteByPath = new Map(remote.map((entry) => [entry.path, entry]));
const mismatches = local.filter((entry) => {
  const deployed = remoteByPath.get(entry.path);
  return !deployed || deployed.bytes !== entry.bytes || deployed.sha256 !== entry.sha256;
});
const inventoryHash = createHash('sha256').update(JSON.stringify(local)).digest('hex');
const report = {
  ok: mismatches.length === 0,
  sourceRelPath: sourceRel,
  container,
  imageDigest: record.imageDigest,
  sourceRevision: record.sourceRevision,
  localFiles: local.length,
  localBytes: local.reduce((sum, entry) => sum + entry.bytes, 0),
  remoteFiles: remote.length,
  matchedFiles: local.length - mismatches.length,
  inventoryHash,
  mismatches,
  additive: true,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
process.exit(report.ok ? 0 : 1);
