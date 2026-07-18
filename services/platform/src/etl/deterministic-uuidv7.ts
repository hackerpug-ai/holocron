/** Deterministic UUIDv7 derived from source creation time + stable tie-breaker seed. */
import { createHash } from 'node:crypto';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function deterministicUuidV7(creationTimeMs: number, seed: string): string {
  const ms = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(creationTimeMs || 0)));
  const digest = createHash('sha256').update(`${ms}:${seed}`).digest();
  const bytes = new Uint8Array(16);

  // Unix epoch milliseconds — top 48 bits.
  let remaining = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  // Version 7 + deterministic random tail from the digest.
  const d0 = digest[0] ?? 0;
  const d1 = digest[1] ?? 0;
  const d2 = digest[2] ?? 0;
  bytes[6] = (0x70 | (d0 & 0x0f)) & 0xff;
  bytes[7] = d1;
  bytes[8] = (0x80 | (d2 & 0x3f)) & 0xff;
  for (let i = 9; i < 16; i++) {
    bytes[i] = digest[i - 6] ?? 0;
  }

  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
