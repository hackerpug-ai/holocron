/**
 * S-UPLOAD-03 — deterministic e2e fixture attach helper.
 * Pure resolution rules (no simulator I/O).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const TESTS_FIXTURE = resolve(REPO, 'tests/fixtures/test-fixture.jpg');
const ASSETS_FIXTURE = resolve(REPO, 'assets/e2e/test-fixture.jpg');
const SHEET = resolve(REPO, 'components/improvements/ImprovementSubmitSheet.tsx');
const STATUS = resolve(REPO, 'components/improvements/ImageUploadStatus.tsx');
const ROUTE = resolve(REPO, 'app/(drawer)/improvements.tsx');
const FIXTURE_HELPER = resolve(REPO, 'lib/e2e/fixture-uri.ts');

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('S-UPLOAD-03 e2e fixture attach + upload honesty', () => {
  it('bundles the same test-fixture.jpg bytes under assets/e2e', () => {
    expect(existsSync(TESTS_FIXTURE), 'tests/fixtures/test-fixture.jpg').toBe(true);
    expect(existsSync(ASSETS_FIXTURE), 'assets/e2e/test-fixture.jpg').toBe(true);
    expect(sha256(ASSETS_FIXTURE)).toBe(sha256(TESTS_FIXTURE));
    expect(sha256(TESTS_FIXTURE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ImprovementSubmitSheet uses resolveAttachImageUriAsync (no bare screenshotUri fail path only)', () => {
    const src = readFileSync(SHEET, 'utf8');
    expect(src).toMatch(/resolveAttachImageUriAsync/);
    expect(src).toMatch(/from ['"]@\/lib\/e2e\/fixture-uri['"]/);
    // Empty CAS finalize_success path must be gone (anti-stub).
    expect(src).not.toMatch(/contentHash:\s*['"]{2}/);
    expect(src).toMatch(/text-submit-success/);
    expect(src).toMatch(/upload finalize returned no content-addressed hash/);
  });

  it('ImageUploadStatus gates upload-success on 64-hex content hash', () => {
    const src = readFileSync(STATUS, 'utf8');
    expect(src).toMatch(/upload-success/);
    expect(src).toMatch(/\[0-9a-f\]\{64\}/);
    expect(src).toMatch(/hasCas/);
  });

  it('improvements route seeds screenshotUri from resolveE2eFixtureUri', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toMatch(/resolveE2eFixtureUri/);
    expect(src).toMatch(/screenshotUri=\{resolveE2eFixtureUri\(\)\}/);
  });

  it('fixture-uri helper honors EXPO_PUBLIC_E2E_FIXTURE_URI + HOLO_E2E gates', () => {
    const src = readFileSync(FIXTURE_HELPER, 'utf8');
    expect(src).toMatch(/EXPO_PUBLIC_E2E_FIXTURE_URI/);
    expect(src).toMatch(/EXPO_PUBLIC_HOLO_E2E|HOLO_E2E/);
    expect(src).toMatch(/assets\/e2e\/test-fixture\.jpg/);
    expect(src).toMatch(/resolveAttachImageUriAsync/);
    expect(src).toMatch(/expo-asset/);
  });
});
