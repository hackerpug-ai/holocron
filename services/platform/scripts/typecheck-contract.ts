#!/usr/bin/env bun
/**
 * T2 contract gate — imp-mcp-schema-drift-hardening.
 *
 * Runs tsgo over the contract program (tsconfig.contract.json: src/mcp +
 * src/tools) and FAILS on ANY error whose file lives in the contract dirs.
 * No baseline/ratchet: a single new error in src/mcp or src/tools fails CI.
 *
 * Why the file filter: TypeScript programs are import-closure based, so this
 * program transitively contains essentially all of services/platform/src —
 * which carries pre-existing strict-mode errors outside the contract surface
 * (queue, observability, cutover, assimilate, transcripts, http, research;
 * including one missing-dependency error). Those are NOT contract-surface and
 * are printed for visibility but do not fail the gate. Everything under
 * src/mcp or src/tools must be and stay clean.
 *
 * Fail-closed: if tsgo crashes or produces no parseable verdict, exit nonzero.
 */
import { spawnSync } from 'node:child_process';

const platformDir = new URL('..', import.meta.url).pathname;
const run = spawnSync(
  'bunx',
  ['tsgo', '--noEmit', '-p', 'tsconfig.contract.json'],
  { cwd: platformDir, stdout: 'pipe', stderr: 'pipe' }
);
const text = run.stdout.toString() + run.stderr.toString();
process.stdout.write(text);

const lines = text.split('\n');
const contractErrors = lines.filter((line) =>
  /src[\\/](mcp|tools)[\\/].*\berror TS\d+/.test(line)
);
const anyErrors = lines.some((line) => /\berror TS\d+/.test(line));

if (contractErrors.length > 0) {
  console.error(
    `\ntypecheck:contract FAILED — ${contractErrors.length} error(s) in the contract surface (src/mcp | src/tools):\n` +
      contractErrors.join('\n')
  );
  process.exit(1);
}
if (!anyErrors && run.exitCode !== 0) {
  console.error(
    `\ntypecheck:contract FAILED — tsgo exited ${run.exitCode} with no parseable diagnostics (fail-closed).`
  );
  process.exit(1);
}
console.log(
  `\ntypecheck:contract OK — contract surface (src/mcp | src/tools) clean` +
    (anyErrors ? ` (transitive non-contract errors printed above are outside the gate)` : ``)
);
