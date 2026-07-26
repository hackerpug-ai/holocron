/**
 * S-UPLOAD-03 AC-4 / TC-4 — Maestro upload.yaml follows send-streams.yml pattern.
 *
 * Static YAML structural check — no simulator I/O.
 * Verify: grep -nE 'appId:|extendedWaitUntil|tapOn|assertVisible|takeScreenshot' .maestro/upload.yaml
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const UPLOAD_YAML = resolve(REPO_ROOT, '.maestro/upload.yaml');
const PATTERN_YAML = resolve(REPO_ROOT, '.maestro/chat/send-streams.yml');

describe('S-UPLOAD-03 AC-4: .maestro/upload.yaml structure', () => {
  it('exists beside the chat send-streams pattern', () => {
    expect(existsSync(PATTERN_YAML), 'pattern source missing').toBe(true);
    expect(existsSync(UPLOAD_YAML), '.maestro/upload.yaml must exist').toBe(true);
  });

  it('declares appId, extendedWaitUntil, tapOn, assertVisible, takeScreenshot', () => {
    const body = readFileSync(UPLOAD_YAML, 'utf8');
    const pattern = readFileSync(PATTERN_YAML, 'utf8');

    // Pattern source itself carries the Maestro shape we mirror.
    expect(pattern).toMatch(/appId:/);
    expect(pattern).toMatch(/extendedWaitUntil:/);
    expect(pattern).toMatch(/tapOn:/);
    expect(pattern).toMatch(/assertVisible:/);
    expect(pattern).toMatch(/takeScreenshot:/);

    expect(body, 'appId header').toMatch(/appId:/);
    expect(body, 'extendedWaitUntil').toMatch(/extendedWaitUntil:/);
    expect(body, 'tapOn').toMatch(/tapOn:/);
    expect(body, 'assertVisible').toMatch(/assertVisible:/);
    expect(body, 'takeScreenshot evidence').toMatch(/takeScreenshot:/);
  });

  it('uses testID conventions attach-button + upload-success', () => {
    const body = readFileSync(UPLOAD_YAML, 'utf8');
    expect(body).toMatch(/id:\s*["']?attach-button["']?/);
    expect(body).toMatch(/id:\s*["']?upload-success["']?/);
    // Improvements sheet open path (route + header affordance)
    expect(body).toMatch(/improvements-route-layout|improvements-header-add-button/);
  });

  it('includes at least one takeScreenshot evidence step and launchApp', () => {
    const body = readFileSync(UPLOAD_YAML, 'utf8');
    const screenshots = body.match(/takeScreenshot:/g) ?? [];
    expect(screenshots.length, '>=1 screenshot artifact step').toBeGreaterThanOrEqual(1);
    expect(body).toMatch(/launchApp:/);
  });
});
