/**
 * Pure SHA-256 fallback must match node crypto for the upload fixture.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256HexOfBytes, sha256HexPure } from '@/app/zero/platform';

const FIXTURE = resolve(process.cwd(), 'tests/fixtures/test-fixture.jpg');

describe('sha256HexPure (Hermes fallback)', () => {
  it('matches node crypto for empty buffer', () => {
    const empty = new Uint8Array(0);
    const node = createHash('sha256').update(empty).digest('hex');
    expect(sha256HexPure(empty)).toBe(node);
  });

  it('matches node crypto for "abc"', () => {
    const bytes = new TextEncoder().encode('abc');
    const node = createHash('sha256').update(bytes).digest('hex');
    expect(sha256HexPure(bytes)).toBe(node);
    expect(node).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches node crypto for test-fixture.jpg', () => {
    const bytes = readFileSync(FIXTURE);
    const node = createHash('sha256').update(bytes).digest('hex');
    expect(sha256HexPure(bytes)).toBe(node);
    expect(node).toBe('db6fcc9792c6098b653269e9da2bbc54e8e75acc31ae4442c665feae25c482fb');
  });

  it('sha256HexOfBytes resolves to the same digest', async () => {
    const bytes = readFileSync(FIXTURE);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const hex = await sha256HexOfBytes(ab);
    expect(hex).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
