/**
 * D06-04 — real `convex export` invocation.
 *
 * Always spawns a fresh export into a new directory. Never reuses a stale
 * export path. Watermark capture must precede this module's entrypoint.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveRepoRoot } from '../config/secrets.ts';
import { defaultExportRoot } from './export-watermark.ts';

export type ConvexExportResult = {
  ok: true;
  exportDir: string;
  zipPath: string;
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
  /** sha256 of the zip bytes (or of the export dir file manifest when no zip). */
  exportZipHash: string;
  includeFileStorage: boolean;
};

export type ConvexExportFailure = {
  ok: false;
  error: { code: string; message: string };
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
};

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/** Hash every file under root for a stable export identity when needed. */
export function hashExportDirectory(exportDir: string): string {
  const h = createHash('sha256');
  for (const file of listFiles(exportDir)) {
    const rel = file.slice(exportDir.length + 1);
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(file));
    h.update('\0');
  }
  return h.digest('hex');
}

function unzipTo(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', destDir], {
    encoding: 'utf8',
    timeout: 300_000,
  });
  if ((r.status ?? 1) !== 0) {
    throw new Error(`unzip failed for ${zipPath}: ${r.stderr || r.stdout || `status=${r.status}`}`);
  }
}

/**
 * Resolve the documents.jsonl root for a convex export zip layout.
 * Some exports nest a single top-level folder; others explode tables at root.
 */
export function resolveExportDataRoot(extractedDir: string): string {
  const tablesMarker = join(extractedDir, '_tables', 'documents.jsonl');
  if (existsSync(tablesMarker)) return extractedDir;

  const entries = readdirSync(extractedDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (dirs.length === 1) {
    const nested = join(extractedDir, dirs[0]!);
    if (existsSync(join(nested, '_tables', 'documents.jsonl'))) return nested;
  }
  // Fall back: any child with _tables
  for (const name of dirs) {
    const candidate = join(extractedDir, name);
    if (existsSync(join(candidate, '_tables', 'documents.jsonl'))) return candidate;
  }
  return extractedDir;
}

/**
 * Count rows in table/documents.jsonl (0 if missing).
 */
export function countExportTableRows(exportDir: string, table: string): number {
  const file = join(exportDir, table, 'documents.jsonl');
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;
}

/**
 * Spawn a real `npx convex export` against the linked deployment.
 * Writes into a fresh directory under exportRoot — never reuses prior paths.
 */
export function runConvexExport(options?: {
  cwd?: string;
  exportRoot?: string;
  includeFileStorage?: boolean;
  /** Inject for tests; default spawns real convex export. */
  spawnExport?: (args: { zipPath: string; cwd: string; includeFileStorage: boolean }) => {
    status: number;
    stdout: string;
    stderr: string;
  };
}): ConvexExportResult | ConvexExportFailure {
  const cwd = options?.cwd ?? resolveRepoRoot();
  const exportRoot = options?.exportRoot ?? defaultExportRoot(cwd);
  const includeFileStorage = options?.includeFileStorage !== false;
  const stamp = `${Date.now()}-${process.pid}`;
  const runDir = resolve(exportRoot, stamp);
  const zipPath = join(runDir, 'convex-export.zip');
  const extractDir = join(runDir, 'extracted');

  mkdirSync(runDir, { recursive: true });

  const exportStartedAtMs = Date.now();
  const spawn =
    options?.spawnExport ??
    (({ zipPath: zp, cwd: workdir, includeFileStorage: inc }) => {
      const args = ['convex', 'export', '--path', zp];
      if (inc) args.push('--include-file-storage');
      const r = spawnSync('npx', args, {
        cwd: workdir,
        encoding: 'utf8',
        timeout: 600_000,
        env: process.env,
        maxBuffer: 64 * 1024 * 1024,
      });
      return {
        status: r.status ?? 1,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
    });

  try {
    const result = spawn({ zipPath, cwd, includeFileStorage });
    const exportFinishedAtMs = Date.now();
    if (result.status !== 0) {
      return {
        ok: false,
        error: {
          code: 'CONVEX_EXPORT_FAILED',
          message: `npx convex export failed (status=${result.status}): ${result.stderr || result.stdout}`,
        },
        exportStartedAtMs,
        exportFinishedAtMs,
      };
    }

    // CLI may write either the zip path we requested or a directory.
    let resolvedZip = zipPath;
    if (!existsSync(resolvedZip)) {
      // convex sometimes writes to path as directory containing zip
      if (existsSync(runDir)) {
        const zips = readdirSync(runDir).filter((n) => n.endsWith('.zip'));
        if (zips[0]) resolvedZip = join(runDir, zips[0]);
      }
    }
    if (!existsSync(resolvedZip)) {
      // Some versions write extracted content directly when path is a dir
      const directRoot = resolveExportDataRoot(runDir);
      if (existsSync(join(directRoot, '_tables', 'documents.jsonl'))) {
        const exportDir = join(runDir, 'export');
        // Normalize to a dedicated export dir
        if (directRoot !== exportDir) {
          mkdirSync(exportDir, { recursive: true });
          // already extracted into runDir — use directRoot
        }
        const hash = hashExportDirectory(directRoot);
        writeFileSync(
          join(runDir, 'export-meta.json'),
          `${JSON.stringify({ exportDir: directRoot, exportZipHash: hash }, null, 2)}\n`
        );
        return {
          ok: true,
          exportDir: directRoot,
          zipPath: resolvedZip,
          exportStartedAtMs,
          exportFinishedAtMs: Date.now(),
          exportZipHash: hash,
          includeFileStorage,
        };
      }
      return {
        ok: false,
        error: {
          code: 'CONVEX_EXPORT_MISSING',
          message: `convex export produced no zip at ${zipPath}`,
        },
        exportStartedAtMs,
        exportFinishedAtMs: Date.now(),
      };
    }

    unzipTo(resolvedZip, extractDir);
    const exportDir = resolveExportDataRoot(extractDir);
    const exportZipHash = sha256File(resolvedZip);
    writeFileSync(
      join(runDir, 'export-meta.json'),
      `${JSON.stringify(
        {
          exportDir,
          zipPath: resolvedZip,
          exportZipHash,
          exportStartedAtMs,
          exportFinishedAtMs,
        },
        null,
        2
      )}\n`
    );

    return {
      ok: true,
      exportDir,
      zipPath: resolvedZip,
      exportStartedAtMs,
      exportFinishedAtMs,
      exportZipHash,
      includeFileStorage,
    };
  } catch (err) {
    const exportFinishedAtMs = Date.now();
    return {
      ok: false,
      error: {
        code: 'CONVEX_EXPORT_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
      exportStartedAtMs,
      exportFinishedAtMs,
    };
  }
}

/**
 * Materialize a fixture export into a fresh directory (test/helper only).
 * Production path uses runConvexExport.
 */
export function materializeFreshExportCopy(options: { sourceDir: string; exportRoot: string }): {
  exportDir: string;
  exportStartedAtMs: number;
  exportFinishedAtMs: number;
} {
  const exportStartedAtMs = Date.now();
  const stamp = `${Date.now()}-${process.pid}-copy`;
  const exportDir = resolve(options.exportRoot, stamp, 'export');
  mkdirSync(resolve(exportDir, '..'), { recursive: true });
  // Use cp via spawn for large trees
  const r = spawnSync('cp', ['-R', options.sourceDir, exportDir], { encoding: 'utf8' });
  if ((r.status ?? 1) !== 0) {
    throw new Error(`cp fixture failed: ${r.stderr || r.stdout}`);
  }
  return { exportDir, exportStartedAtMs, exportFinishedAtMs: Date.now() };
}

/** Remove an export run directory tree (best-effort cleanup). */
export function removeExportRun(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
