import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLOCKER_PATH = join(REPO_ROOT, '.tmp/S33-OPS-01/S33-OPS-01-inference1-blocker.json');
const INFERENCE1_MODELS = 'http://inference1.tail011a51.ts.net:8003/v1/models';
const INFERENCE2_MODELS = 'http://inference2.tail011a51.ts.net:8003/v1/models';
const QWEN38 = 'Qwen3.8-27B-8bit';
const QWEN36 = 'Qwen3.6-35B-A3B-MLX-8bit';
const QWEN38_PATH = '~/models/mlx-community/Qwen3.8-27B-8bit';
const CONFIG_SHA256 = '8f80874ac3ad8fa386d3f6dc0ea85377f703376e009a03dee0360e08e289a25d';
const HEADROOM_THRESHOLD_KB = 46137344;

type ModelList = {
  data: Array<{ id: string }>;
};

type BlockerArtifact = {
  task_id: string;
  status: string;
  reason: string;
  threshold_gib: number;
  threshold_kb: number;
  measured_free_kb_before: number;
  measured_free_gib_before: number;
  measured_free_kb_after: number;
  measured_free_gib_after: number;
  disk_free_kb_delta: number;
  copy_attempted: boolean;
  model_ids_before: string[];
  model_ids_after: string[];
  qwen38_file_count_before: number;
  qwen38_file_count_after: number;
};

async function readRemote(host: string, command: string): Promise<string> {
  const result = await execFileAsync('ssh', [host, command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  return result.stdout.trim();
}

async function readModels(url: string): Promise<ModelList> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = (await response.json()) as ModelList;
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  if (!Array.isArray(body.data) || body.data.some((model) => typeof model.id !== 'string')) {
    throw new Error(`GET ${url} returned an invalid model list`);
  }
  return body;
}

function modelIds(models: ModelList): string[] {
  return models.data.map((model) => model.id);
}

describe('S33-OPS-01 real fleet state', () => {
  beforeAll(() => {
    if (process.env.PLATFORM_IT !== '1') {
      throw new Error('PLATFORM_IT=1 is required for the real inference fleet test');
    }
  });

  it('AC-1 verifies inference2 serves Qwen3.8 with 40 files and the source hash', async () => {
    const models = await readModels(INFERENCE2_MODELS);
    expect(modelIds(models)).toContain(QWEN38);

    const fileCount = await readRemote('inference2', `find ${QWEN38_PATH} -type f | wc -l`);
    expect(Number(fileCount)).toBe(40);

    const hashOutput = await readRemote('inference2', `shasum -a 256 ${QWEN38_PATH}/config.json`);
    expect(hashOutput.split(/\s+/)[0]).toBe(CONFIG_SHA256);
  });

  it('AC-2 verifies inference1 fails closed below the live headroom threshold', async () => {
    const freeKbOutput = await readRemote('inference1', "df -k / | awk 'NR==2{print $4}'");
    expect(freeKbOutput).toMatch(/^\d+$/);
    expect(Number(freeKbOutput)).toBeLessThan(HEADROOM_THRESHOLD_KB);

    const directoryCheckOutput = await readRemote('inference1', `test ! -e ${QWEN38_PATH}`);
    expect(directoryCheckOutput).toBe('');

    const models = await readModels(INFERENCE1_MODELS);
    const ids = modelIds(models);
    expect(ids).toEqual([QWEN36]);

    const blocker = JSON.parse(await readFile(BLOCKER_PATH, 'utf8')) as BlockerArtifact;
    expect(blocker).toMatchObject({
      task_id: 'S33-OPS-01',
      status: 'blocked_insufficient_headroom',
      reason: 'inference1 live free disk is below the 44 GiB provisioning threshold',
      threshold_gib: 44,
      threshold_kb: HEADROOM_THRESHOLD_KB,
      copy_attempted: false,
      model_ids_before: [QWEN36],
      model_ids_after: [QWEN36],
      qwen38_file_count_before: 0,
      qwen38_file_count_after: 0,
    });
    expect(blocker.measured_free_kb_before).toBeLessThan(HEADROOM_THRESHOLD_KB);
    expect(blocker.measured_free_kb_after).toBeLessThan(HEADROOM_THRESHOLD_KB);
    expect(blocker.measured_free_gib_before).toBeLessThan(blocker.threshold_gib);
    expect(blocker.measured_free_gib_after).toBeLessThan(blocker.threshold_gib);
    expect(blocker.measured_free_kb_after).toBe(
      blocker.measured_free_kb_before + blocker.disk_free_kb_delta
    );
    expect(blocker.disk_free_kb_delta).toBeGreaterThanOrEqual(-2048);
    expect(blocker.disk_free_kb_delta).toBeLessThanOrEqual(2048);
  });
});
