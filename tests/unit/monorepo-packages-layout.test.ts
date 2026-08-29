import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('monorepo packages/ layout (PKG-05)', () => {
  it('keeps all five product package.json files under packages/', () => {
    for (const pkg of ['mobile', 'platform', 'mcp', 'docs-reader', 'web']) {
      expect(existsSync(path.join(root, 'packages', pkg, 'package.json')), pkg).toBe(true);
    }
    expect(existsSync(path.join(root, 'services/platform/package.json'))).toBe(false);
    expect(existsSync(path.join(root, 'holocron-mcp/package.json'))).toBe(false);
    expect(existsSync(path.join(root, 'packages/fulcrum'))).toBe(false);
  });

  it('places Expo identity under packages/mobile and removes root app.json', () => {
    expect(existsSync(path.join(root, 'packages/mobile/app.json'))).toBe(true);
    expect(existsSync(path.join(root, 'packages/mobile/app.config.cjs'))).toBe(true);
    expect(existsSync(path.join(root, 'packages/mobile/eas.json'))).toBe(true);
    expect(existsSync(path.join(root, 'packages/mobile/metro.config.cjs'))).toBe(true);
    expect(existsSync(path.join(root, 'app.json'))).toBe(false);
    expect(existsSync(path.join(root, 'app.config.cjs'))).toBe(false);

    const mobile = JSON.parse(read('packages/mobile/package.json')) as {
      name: string;
      main?: string;
      dependencies?: Record<string, string>;
    };
    expect(mobile.name).toBe('@holocron/mobile');
    expect(mobile.main).toBe('index.js');
    expect(mobile.dependencies?.expo).toBeTruthy();

    const orchestrator = JSON.parse(read('package.json')) as {
      name: string;
      main?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(orchestrator.name).toBe('holocron');
    expect(orchestrator.main).toBeUndefined();
    expect(orchestrator.dependencies?.expo).toBeUndefined();
    expect(orchestrator.scripts?.start).toContain('@holocron/mobile');
  });

  it('lists packages/* only in pnpm-workspace.yaml', () => {
    const ws = read('pnpm-workspace.yaml');
    expect(ws).toMatch(/packages\/\*/);
    expect(ws).not.toMatch(/services\/platform/);
    expect(ws).not.toMatch(/^\s*-\s*"\."\s*$/m);
  });

  it('documents the five packages and in-process Fulcrum in AGENTS.md Package map', () => {
    const agents = read('AGENTS.md');
    const mapIdx = agents.indexOf('## Package map');
    const secretIdx = agents.indexOf('## Secret index');
    expect(mapIdx).toBeGreaterThan(0);
    expect(secretIdx).toBeGreaterThan(mapIdx);
    expect(agents).toContain('packages/mobile');
    expect(agents).toContain('packages/platform');
    expect(agents).toContain('packages/mcp');
    expect(agents).toContain('packages/docs-reader');
    expect(agents).toContain('packages/web');
    expect(agents).toMatch(/Fulcrum/i);
    expect(agents).not.toContain('services/platform/config/secrets.yaml');
    expect(agents).toContain('packages/platform/config/secrets.yaml');
  });

  it('keeps platform Docker COPY and bin/holo on packages/platform', () => {
    expect(read('packages/platform/Dockerfile')).toContain('COPY packages/platform/package.json');
    expect(read('bin/holo')).toContain('packages/platform/src/cli/holo.ts');
  });
});
