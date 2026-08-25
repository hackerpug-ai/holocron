import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { describe, expect, it } from 'vitest';
import { assimilateRepoWorkflow } from './workflow.ts';

function git(args: string[], cwd: string): void {
  // Hermetic — see acquire.test.ts: this suite runs under git hooks and agent
  // gates that export GIT_DIR/GIT_WORK_TREE; without stripping them the
  // fixture's "init" commit lands in the enclosing repo instead of here.
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || args.join(' '));
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wf-repo-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'main.ts'),
    'export function boot(): void { console.log("boot"); }\n'
  );
  writeFileSync(
    join(root, 'README.md'),
    '# Widget runtime\nThis is the fixture repository used in assimilate tests.\n'
  );
  git(['init', '-q'], root);
  git(['add', '-A'], root);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], root);
  return root;
}

describe('assimilateRepoWorkflow', () => {
  it('is registered and reaches COMPLETE from planted receipts without ACP', async () => {
    const repo = makeRepo();
    const scratch = mkdtempSync(join(tmpdir(), 'wf-scratch-'));
    const mastra = new Mastra({
      workflows: { assimilateRepo: assimilateRepoWorkflow },
    });
    const wf = mastra.getWorkflow('assimilateRepo');
    const run = await wf.createRun();
    const result = await run.start({
      inputData: {
        repositoryUrl: repo,
        profile: 'thorough',
        autoApprove: true,
        allowSelf: true,
        scratchRoot: scratch,
        plantedCrawler: true,
      },
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.verdict).toBe('COMPLETE');
    expect(result.result.verifiedRead).toBe(result.result.inScope);
    expect(result.result.inScope).toBeGreaterThan(0);
    expect(result.result.markdown).toMatch(/Coverage Ledger/);
    expect(result.result.markdown).toMatch(/Essence/);
  });

  it('suspends when autoApprove is false', async () => {
    const repo = makeRepo();
    const scratch = mkdtempSync(join(tmpdir(), 'wf-scratch-'));
    const mastra = new Mastra({
      workflows: { assimilateRepo: assimilateRepoWorkflow },
    });
    const wf = mastra.getWorkflow('assimilateRepo');
    const run = await wf.createRun();
    const result = await run.start({
      inputData: {
        repositoryUrl: repo,
        autoApprove: false,
        allowSelf: true,
        scratchRoot: scratch,
        plantedCrawler: true,
      },
    });
    expect(result.status).toBe('suspended');
  });
});
