/**
 * Durable re-arm worker for scripts/rearm-sprint30-cutover-control-plane.sh.
 * Never regex-rewrites arbitrary secrets content; only (1) surgically repairs
 * the known HOLO_MIGRATION_READ_ONLY: "1"" corruption shape, then (2) writes
 * via platform upsertSecretsFile helpers.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import {
  writeDurableDataPlane,
  writeDurableMigrationReadOnly,
} from '../../packages/platform/src/cutover/soak-fence.ts';

const secretsPath = process.env.HOLO_SECRETS_PATH;
if (!secretsPath) {
  console.error('error: HOLO_SECRETS_PATH required');
  process.exit(2);
}

const fence = process.env.FENCE;
if (fence !== '0' && fence !== '1') {
  console.error('error: FENCE must be 0|1');
  process.exit(2);
}

const plane = process.env.PLANE || '';
const target = process.env.TARGET || '';

function fenceLineShape(text: string): string {
  const line = text.split('\n').find((l) => /^HOLO_MIGRATION_READ_ONLY\s*:/.test(l)) || '';
  const m = line.match(/^HOLO_MIGRATION_READ_ONLY:\s*(.*)$/);
  return (m?.[1] ?? '').trim();
}

function assertNoDoubleQuoteCorruption(text: string, phase: string): void {
  const line = text.split('\n').find((l) => /^HOLO_MIGRATION_READ_ONLY\s*:/.test(l)) || '';
  if (/"1""|"0""/.test(line)) {
    console.error(
      `error: ${phase}: doubled quotes on HOLO_MIGRATION_READ_ONLY (regex re-arm bug shape)`
    );
    console.error('  line_shape: "HOLO_MIGRATION_READ_ONLY: <corrupt-quotes>"');
    process.exit(2);
  }
  try {
    YAML.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`error: ${phase}: secrets.yaml YAML parse failed: ${msg}`);
    process.exit(2);
  }
}

/** Repair only HOLO_MIGRATION_READ_ONLY: "1"" / "0"" without touching other keys. */
function repairDoubledFenceQuotes(text: string): { text: string; repaired: boolean } {
  const lines = text.split('\n');
  let repaired = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!/^HOLO_MIGRATION_READ_ONLY\s*:/.test(line)) continue;
    const m = line.match(/^HOLO_MIGRATION_READ_ONLY:\s*(.*)$/);
    const raw = (m?.[1] ?? '').trim();
    // corrupt shapes: "1""  "0""  '1''  bare 1""
    if (/^["']?[01]["']{2,}$/.test(raw) || raw === '"1""' || raw === '"0""') {
      const digit = (raw.match(/[01]/) || ['1'])[0]!;
      lines[i] = `HOLO_MIGRATION_READ_ONLY: "${digit}"`;
      repaired = true;
    }
  }
  return { text: lines.join('\n'), repaired };
}

let before = readFileSync(secretsPath, 'utf8');
const repair = repairDoubledFenceQuotes(before);
if (repair.repaired) {
  writeFileSync(secretsPath, repair.text);
  before = readFileSync(secretsPath, 'utf8');
  console.error('repaired: HOLO_MIGRATION_READ_ONLY doubled-quote line');
}
assertNoDoubleQuoteCorruption(before, 'pre-write');

const fenceResult = writeDurableMigrationReadOnly(fence, { secretsPath });
const out: Record<string, unknown> = {
  fence,
  secretsPath: fenceResult.secretsPath,
  fence_keys: fenceResult.writtenKeys,
  doubled_quote_repaired: repair.repaired,
};

if (plane && target) {
  const planeResult = writeDurableDataPlane(plane, target, { secretsPath });
  out.plane = plane;
  out.target = target;
  out.plane_keys = planeResult.writtenKeys;
}

const after = readFileSync(secretsPath, 'utf8');
assertNoDoubleQuoteCorruption(after, 'post-write');
const shape = fenceLineShape(after);
if (shape !== `"${fence}"` && shape !== fence) {
  console.error(
    `error: post-write unexpected HOLO_MIGRATION_READ_ONLY shape: ${JSON.stringify(shape)}`
  );
  process.exit(2);
}
out.post_parse_ok = true;
out.fence_value_shape = shape === `"${fence}"` ? 'quoted' : 'bare';
console.log(JSON.stringify(out, null, 2));
