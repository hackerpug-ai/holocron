/**
 * MCP Fixture Schema Validation — validates the structure of error and replay fixtures.
 *
 * Every `_error.json` fixture must have:
 *   - `code` (non-empty string, not the generic 'ERROR')
 *   - `message` (non-empty string)
 *
 * Every `_replay.json` fixture must have:
 *   - `idempotency_key` (array)
 *   - `stored_result` (string)
 *   - `first_call_result` (object)
 *   - `second_call_result` (object, identical to first_call_result)
 *
 * Run: MCP_IT=1 bunx vitest run tests/integration/mcp-fixture-schema-validation.test.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES_DIR = resolve(ROOT, 'services/platform/tests/fixtures/mcp-manifest');

const errorFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('_error.json'));
const replayFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('_replay.json'));

function loadJson(filename: string): Record<string, unknown> {
  const filePath = resolve(FIXTURES_DIR, filename);
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('MCP error fixture schema validation', () => {
  it('has error fixtures to validate', () => {
    // would fail if no error fixtures existed
    expect(errorFiles.length).toBeGreaterThan(0);
  });

  it.each(errorFiles)('%s — has non-empty code field', (filename) => {
    // would fail if the code field was missing or empty
    const fixture = loadJson(filename);
    const code = fixture.code;
    expect(typeof code, `${filename}: code must be a string`).toBe('string');
    expect((code as string).length, `${filename}: code must not be empty`).toBeGreaterThan(0);
  });

  it.each(errorFiles)('%s — code is not the generic "ERROR"', (filename) => {
    // would fail if the code was the uninformative generic 'ERROR'
    const fixture = loadJson(filename);
    const code = fixture.code;
    expect(code, `${filename}: code must not be the generic 'ERROR'`).not.toBe('ERROR');
  });

  it.each(errorFiles)('%s — has non-empty message field', (filename) => {
    // would fail if the message field was missing or empty
    const fixture = loadJson(filename);
    const message = fixture.message;
    expect(typeof message, `${filename}: message must be a string`).toBe('string');
    expect((message as string).length, `${filename}: message must not be empty`).toBeGreaterThan(0);
  });
});

describe('MCP replay fixture schema validation', () => {
  it('has replay fixtures to validate', () => {
    // would fail if no replay fixtures existed
    expect(replayFiles.length).toBeGreaterThan(0);
  });

  it.each(replayFiles)('%s — has idempotency_key array', (filename) => {
    // would fail if idempotency_key was missing or not an array
    const fixture = loadJson(filename);
    const key = fixture.idempotency_key;
    expect(Array.isArray(key), `${filename}: idempotency_key must be an array`).toBe(true);
    expect(
      (key as unknown[]).length,
      `${filename}: idempotency_key must not be empty`
    ).toBeGreaterThan(0);
  });

  it.each(replayFiles)('%s — has stored_result string', (filename) => {
    // would fail if stored_result was missing or not a string
    const fixture = loadJson(filename);
    const stored = fixture.stored_result;
    expect(typeof stored, `${filename}: stored_result must be a string`).toBe('string');
    expect(
      (stored as string).length,
      `${filename}: stored_result must not be empty`
    ).toBeGreaterThan(0);
  });

  it.each(replayFiles)('%s — has first_call_result object', (filename) => {
    // would fail if first_call_result was missing or not an object
    const fixture = loadJson(filename);
    const first = fixture.first_call_result;
    expect(typeof first, `${filename}: first_call_result must be an object`).toBe('object');
    expect(first, `${filename}: first_call_result must not be null`).not.toBeNull();
  });

  it.each(replayFiles)('%s — has second_call_result object', (filename) => {
    // would fail if second_call_result was missing or not an object
    const fixture = loadJson(filename);
    const second = fixture.second_call_result;
    expect(typeof second, `${filename}: second_call_result must be an object`).toBe('object');
    expect(second, `${filename}: second_call_result must not be null`).not.toBeNull();
  });

  it.each(replayFiles)('%s — second_call_result matches first_call_result', (filename) => {
    // would fail if the two calls returned different results (breaking idempotency)
    const fixture = loadJson(filename);
    const first = fixture.first_call_result;
    const second = fixture.second_call_result;
    expect(second, `${filename}: second_call_result must equal first_call_result`).toEqual(first);
  });
});
