import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AcpAgent } from '@mastra/acp';
import { ASSIMILATE_ACP } from './acp-pin.ts';
import { type CrawlerFn, type CrawlerJob, type SynthesizerFn, writeReturn } from './crawler.ts';
import { AssimilateError } from './errors.ts';
import type { WorkerReturn } from './types.ts';

function opencodeBin(): string {
  return process.env.OPENCODE_BIN ?? 'opencode';
}

function isExecutable(command: string): boolean {
  if (command.includes('/')) {
    try {
      accessSync(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir) continue;
    try {
      accessSync(`${dir}/${command}`, constants.X_OK);
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

export function assertAcpReady(): void {
  if (!isExecutable(opencodeBin())) {
    throw new AssimilateError(
      'ASSIMILATE_ACP_UNAVAILABLE',
      `OpenCode binary '${opencodeBin()}' is not on PATH`
    );
  }
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) {
    throw new AssimilateError(
      'ASSIMILATE_DEEPSEEK_KEY_MISSING',
      'DEEPSEEK_API_KEY must be set in the process environment'
    );
  }
}

function permissionHandler() {
  return async (request: {
    options?: Array<{ optionId?: string; kind?: string }>;
  }): Promise<{ outcome: { outcome: 'selected'; optionId: string } }> => {
    const allow =
      request.options?.find((o) => o.kind === 'allow_once' || o.kind === 'allow_always') ??
      request.options?.[0];
    const optionId = allow?.optionId ?? 'allow-once';
    return { outcome: { outcome: 'selected', optionId } };
  };
}

/** Mastra's postgres DATABASE_URL must not leak into OpenCode's own sqlite. */
export function acpSpawn(): { command: string; args: string[] } {
  return {
    command: '/bin/sh',
    args: [
      '-ec',
      'unset DATABASE_URL PGPASSWORD MASTRA_API_KEY FLEET_KEY; exec "$1" acp',
      'opencode-acp',
      opencodeBin(),
    ],
  };
}

async function runLeaf(job: CrawlerJob, prompt: string): Promise<string> {
  assertAcpReady();
  const spawn = acpSpawn();
  const agent = new AcpAgent({
    id: `assim-${job.id}`,
    name: `assimilate ${job.id}`,
    description: 'Holocron assimilate ACP leaf',
    command: spawn.command,
    args: spawn.args,
    cwd: job.root,
    env: {
      HOME: process.env.HOME || '/home/bun',
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || '/home/bun/.config',
      XDG_DATA_HOME: process.env.XDG_DATA_HOME || '/home/bun/.local/share',
      XDG_STATE_HOME: process.env.XDG_STATE_HOME || '/home/bun/.local/state',
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || '/home/bun/.cache',
      OPENCODE_CONFIG:
        process.env.OPENCODE_CONFIG || '/home/bun/.config/opencode/opencode.json',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
    },
    model: ASSIMILATE_ACP.model,
    persistSession: false,
    onPermissionRequest: permissionHandler() as never,
  });
  const models = await agent.getAvailableModels();
  void models;
  await agent.setModel(ASSIMILATE_ACP.model);
  const result = await agent.generate(prompt);
  return typeof result === 'object' && result && 'text' in result ? String(result.text ?? '') : '';
}

function parseReturn(job: CrawlerJob, text: string): WorkerReturn {
  const onDisk = join(job.returnsDir, `${job.id}.json`);
  if (existsSync(onDisk)) {
    return JSON.parse(readFileSync(onDisk, 'utf8')) as WorkerReturn;
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { shard: job.kind === 'shard' ? job.id : undefined, findings: [], receipts: [] };
  }
  try {
    return JSON.parse(match[0]) as WorkerReturn;
  } catch {
    return { shard: job.kind === 'shard' ? job.id : undefined, findings: [], receipts: [] };
  }
}

export function acpCrawler(): CrawlerFn {
  return async (job) => {
    const files = job.files.map((p) => `- ${p}`).join('\n');
    const prompt = `You are a Borg assimilation crawler.
ROOT: ${job.root}
JOB: ${job.kind} ${job.id} (${job.key})
FILES:
${files || '(none — external context only)'}

Read every listed file. Write JSON to ${join(job.returnsDir, `${job.id}.json`)} with:
{"shard":"${job.id}","findings":[{"claim":"...","path":"<full path>","line":1,"evidence":"<verbatim line>","kind":"pattern"}],"receipts":[{"path":"...","lines":1,"opening_quote":"<verbatim>"}]}
Every listed file must appear as a finding path or a receipt. Quote verbatim source lines. Use full paths.
Then reply with the JSON.`;
    const text = await runLeaf(job, prompt);
    const ret = parseReturn(job, text);
    writeReturn(job, ret);
    return ret;
  };
}

export function acpSynthesizer(): SynthesizerFn {
  return async ({ manifest, returnsDir }) => {
    const job: CrawlerJob = {
      kind: 'lens',
      id: 'synthesis',
      key: 'essence',
      files: [],
      root: manifest.target.root,
      returnsDir,
    };
    const prompt = `Write a 3-6 sentence essence of the repository at ${manifest.target.root} (${manifest.target.input} @ ${manifest.target.sha}).
Ground claims in files that were actually read. No coverage claims you cannot prove. Reply with plain text only.`;
    return (await runLeaf(job, prompt)).trim();
  };
}
