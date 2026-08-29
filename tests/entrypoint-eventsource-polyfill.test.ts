import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('native entrypoint', () => {
  it('installs EventSource DOM globals before Expo Router evaluates the app graph', () => {
    const entry = readFileSync(join(root, 'packages/mobile/index.js'), 'utf8');
    const packageJson = JSON.parse(
      readFileSync(join(root, 'packages/mobile/package.json'), 'utf8')
    ) as {
      main?: string;
    };
    const polyfill = entry.indexOf("require('./lib/eventsource-rn-polyfill.js')");
    const router = entry.indexOf("require('expo-router/entry')");

    expect(packageJson.main).toBe('index.js');
    expect(polyfill).toBeGreaterThanOrEqual(0);
    expect(router).toBeGreaterThan(polyfill);
  });
});
