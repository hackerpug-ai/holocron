#!/usr/bin/env bun
/**
 * CLI probe for pure-TS evidence gate (pipes-1 AC-3 verify path).
 * Usage: pnpm exec bun src/research/test-evidence-gate.ts < payload.json
 */
import { evaluateEvidenceGate } from './evidence-gate.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin();
if (!raw.trim()) {
  console.error('test-evidence-gate: expected JSON on stdin');
  process.exit(2);
}

const input = JSON.parse(raw) as unknown;
const result = evaluateEvidenceGate(input as never);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.admitted || result.direction === 'refuting' ? 0 : 1);
