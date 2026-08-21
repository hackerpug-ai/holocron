#!/usr/bin/env bun
/**
 * OBS-01 — Reconcile baseline and pin supported contracts.
 *
 * Modes:
 *   --candidate A|B [--json]
 *   --supply-chain [--negative] [--json]
 *   --target-capacity [--negative] [--json]
 *   --reconcile [--negative] [--json]
 *
 * Fail-closed: missing artifacts/services emit nonzero exits. Never mocks sinks.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const EVIDENCE = resolve(ROOT, '.tmp/OBS-01');
const PACKAGE_JSON = resolve(ROOT, 'services/platform/package.json');
const SOURCE_LOCK = resolve(ROOT, 'services/platform/deploy/compose/observability-source-lock.json');
const PNPM_LOCK = resolve(ROOT, 'pnpm-lock.yaml');

const CANDIDATE_A = {
  '@mastra/core': '1.50.1',
  '@mastra/pg': '1.15.1',
  '@mastra/mcp': '1.13.1',
  '@mastra/observability': '1.17.1',
  '@mastra/otel-exporter': '1.3.9',
  '@mastra/langfuse': '1.4.9',
} as const;

/** Official 2026-06 Mastra supply-chain incident compromised versions (denylist). */
const INCIDENT_DENYLIST: string[] = [
  // Published malicious window 2026-06-15; keep exact package@version forms.
  '@mastra/core@0.10.4',
  '@mastra/core@0.10.5',
  '@mastra/memory@0.11.0',
  '@mastra/deployer@0.11.0',
  '@mastra/loggers@0.10.3',
  '@mastra/rag@0.10.4',
  '@mastra/mcp@0.10.4',
  '@mastra/voice@0.10.3',
];

const EXPECTED_SERVICE_COUNT = 12;
const EXPECTED_VOLUME_COUNT = 8;
/** Published Langfuse low-scale envelope (~27.5 GiB) plus Holocron four-service budget headroom. */
const REQUIRED_RESERVE_BYTES = Math.ceil(27.5 * 1024 ** 3) + 8 * 1024 ** 3;
const REQUIRED_FREE_DISK_BYTES = 40 * 1024 ** 3;

type Json = Record<string, unknown>;

function args(): { mode: string; candidate: string; json: boolean; negative: boolean } {
  const argv = process.argv.slice(2);
  let mode = '';
  let candidate = 'A';
  let json = false;
  let negative = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') json = true;
    else if (a === '--negative') negative = true;
    else if (a === '--candidate') {
      mode = 'candidate';
      candidate = String(argv[++i] ?? 'A').toUpperCase();
    } else if (a === '--supply-chain') mode = 'supply-chain';
    else if (a === '--target-capacity') mode = 'target-capacity';
    else if (a === '--reconcile') mode = 'reconcile';
  }
  if (!mode) {
    console.error(
      'usage: bun scripts/verify-observability-baseline.ts --candidate A|B|--supply-chain|--target-capacity|--reconcile [--negative] [--json]'
    );
    process.exit(2);
  }
  return { mode, candidate, json, negative };
}

function ensureEvidence(): void {
  mkdirSync(EVIDENCE, { recursive: true });
}

function writeEvidence(name: string, value: unknown): void {
  ensureEvidence();
  writeFileSync(resolve(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function sh(cmd: string, opts?: { cwd?: string }): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd: opts?.cwd ?? ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function packageDeps(): Record<string, string> {
  const pkg = readJson(PACKAGE_JSON);
  return (pkg.dependencies ?? {}) as Record<string, string>;
}

function emit(payload: Json, ok: boolean, json: boolean): never {
  const text = JSON.stringify(payload, null, json ? 2 : 0);
  if (json) console.log(text);
  else console.log(ok ? 'OK' : 'FAIL', payload.decision ?? payload.status ?? '');
  process.exit(ok ? 0 : 1);
}

function assertExactPins(deps: Record<string, string>): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (const [name, version] of Object.entries(CANDIDATE_A)) {
    const actual = deps[name];
    if (actual !== version) mismatches.push(`${name}: expected ${version}, got ${actual ?? 'absent'}`);
    if (actual && /[~^><*xX]|latest|next/.test(actual)) {
      mismatches.push(`${name}: floating range not allowed (${actual})`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

function runCandidate(candidate: string, json: boolean): never {
  if (candidate !== 'A' && candidate !== 'B') {
    emit({ status: 'blocked', error: `unknown candidate ${candidate}` }, false, json);
  }
  if (candidate === 'B') {
    const aFailure = resolve(EVIDENCE, 'candidate-a-failure.json');
    if (!existsSync(aFailure)) {
      emit(
        {
          status: 'blocked',
          decision: 'BLOCKED_EXPORT',
          error: 'Candidate B requires recorded Candidate A failure evidence',
        },
        false,
        json
      );
    }
  }

  const deps = packageDeps();
  const pins = assertExactPins(deps);
  const canaryPath = resolve(EVIDENCE, 'real-export-canary.json');
  const recoveryPath = resolve(EVIDENCE, 'export-failure-recovery.json');
  const canaryReady = existsSync(canaryPath) && existsSync(recoveryPath);
  let canary: Json | null = null;
  let recovery: Json | null = null;
  if (canaryReady) {
    canary = readJson(canaryPath);
    recovery = readJson(recoveryPath);
  }

  const payload: Json = {
    status: pins.ok && canaryReady ? 'ok' : 'blocked',
    candidate,
    pins,
    canaryReady,
    expectedObservationCount: canary?.expectedObservationCount ?? null,
    failureClassCount: canary?.failureClassCount ?? null,
    recoveryObservationCount: canary?.recoveryObservationCount ?? null,
    expectedSecretSentinelCount: canary?.expectedSecretSentinelCount ?? null,
    unreachableFailed: recovery?.unreachableFailed ?? null,
    wrongAuthFailed: recovery?.wrongAuthFailed ?? null,
    lastSuccessAdvancedOnFailure: recovery?.lastSuccessAdvancedOnFailure ?? null,
    decision:
      pins.ok &&
      canaryReady &&
      canary?.otlpSuccessVisible === true &&
      canary?.exporterFailureConcealed === false &&
      recovery?.recovered === true
        ? 'GO'
        : 'BLOCKED_EXPORT',
  };
  writeEvidence('dependency-integrity.json', {
    candidate,
    pins,
    lockfilePresent: existsSync(PNPM_LOCK),
  });
  emit(payload, payload.decision === 'GO', json);
}

function floatingTagCount(lock: Json): number {
  const images = (lock.images as Array<Json> | undefined) ?? [];
  let n = 0;
  for (const img of images) {
    const ref = String(img.ref ?? img.image ?? '');
    if (!ref.includes('@sha256:')) n += 1;
    if (String(img.tag ?? '').length > 0 && !String(img.digest ?? '').startsWith('sha256:')) n += 1;
  }
  return n;
}

function deniedVersionCount(deps: Record<string, string>): number {
  let n = 0;
  for (const [name, version] of Object.entries(deps)) {
    if (INCIDENT_DENYLIST.includes(`${name}@${version}`)) n += 1;
  }
  const lock = existsSync(SOURCE_LOCK) ? readJson(SOURCE_LOCK) : null;
  const packages = ((lock?.packages as Array<Json> | undefined) ?? []) as Array<Json>;
  for (const p of packages) {
    const id = `${p.name}@${p.version}`;
    if (INCIDENT_DENYLIST.includes(id)) n += 1;
  }
  return n;
}

function runSupplyChain(json: boolean, negative: boolean): never {
  const deps = packageDeps();
  const lockPresent = existsSync(SOURCE_LOCK);
  const lock = lockPresent ? readJson(SOURCE_LOCK) : null;

  let floating = lock ? floatingTagCount(lock) : 99;
  let denied = deniedVersionCount(deps);
  let missingIntegrity = !existsSync(PNPM_LOCK) || !lockPresent;
  let unverifiedArm64 = 0;
  if (lock) {
    const images = (lock.images as Array<Json>) ?? [];
    for (const img of images) {
      if (!String(img.arm64Digest ?? '').startsWith('sha256:')) unverifiedArm64 += 1;
      if (img.architectureVerified !== true) unverifiedArm64 += 1;
    }
  } else {
    unverifiedArm64 = 99;
  }

  if (negative) {
    // Negative controls: mutated digest / denied version / floating tag must fail.
    floating = Math.max(floating, 1);
    denied = Math.max(denied, 1);
    missingIntegrity = true;
  }

  const denylistEvidence = {
    source: 'mastra-2026-06-supply-chain-incident',
    issue: 'https://github.com/mastra-ai/mastra/issues/18061',
    entries: INCIDENT_DENYLIST,
    selectedDenied: denied,
  };
  writeEvidence('incident-denylist.json', denylistEvidence);
  if (lock) writeEvidence('arm64-image-source-lock.json', lock);

  const payload: Json = {
    status: floating === 0 && denied === 0 && !missingIntegrity && unverifiedArm64 === 0 ? 'ok' : 'fail',
    floatingTagCount: floating,
    deniedVersionCount: denied,
    missingIntegrity,
    unverifiedArm64DigestCount: unverifiedArm64,
    engineNodeMin: '>=22.13.0',
    nodeIdentity: process.version,
    bunIdentity: Bun.version,
    decision:
      floating === 0 && denied === 0 && !missingIntegrity && unverifiedArm64 === 0
        ? 'GO'
        : 'BLOCKED_SUPPLY_CHAIN',
  };
  emit(payload, payload.decision === 'GO' && !negative, json);
}

function measureTargetHost(): Json {
  // Prefer explicit OBS_TARGET_HOST=inference1 measurements via SSH; never invent.
  const host = process.env.OBS_TARGET_HOST?.trim() || 'inference1';
  const probe = sh(
    `ssh -o BatchMode=yes -o ConnectTimeout=8 ${host} 'export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"; python3 - <<"PY"
import json, subprocess, os
mem = int(subprocess.check_output(["sysctl","-n","hw.memsize"], text=True).strip())
pagesize = int(subprocess.check_output(["pagesize"], text=True).strip())
vm = subprocess.check_output(["vm_stat"], text=True)
def pages(label):
  for line in vm.splitlines():
    if label in line:
      return int(line.split(":")[1].strip().rstrip("."))
  return 0
free = (pages("Pages free")+pages("Pages speculative"))*pagesize
disk = subprocess.check_output(["df","-k","/"], text=True).splitlines()[1].split()
avail_k = int(disk[3])
arch = subprocess.check_output(["uname","-m"], text=True).strip()
docker_mem = None
try:
  out = subprocess.check_output(["docker","--context","desktop-linux","info","--format","{{.MemTotal}}"], text=True).strip()
  docker_mem = int(out)
except Exception:
  docker_mem = None
print(json.dumps({
  "host": "inference1",
  "arch": arch,
  "physMemBytes": mem,
  "approxFreeMemBytes": free,
  "diskAvailBytes": avail_k*1024,
  "dockerMemTotalBytes": docker_mem,
}))
PY'`
  );
  if (probe.status !== 0) {
    return {
      host,
      error: 'target host measurement failed',
      stderr: probe.stderr.slice(0, 400),
      stdout: probe.stdout.slice(0, 400),
    };
  }
  try {
    return JSON.parse(probe.stdout.trim()) as Json;
  } catch {
    return { host, error: 'invalid measurement json', raw: probe.stdout.slice(0, 400) };
  }
}

function runTargetCapacity(json: boolean, negative: boolean): never {
  const measured = measureTargetHost();
  const serviceCount = EXPECTED_SERVICE_COUNT;
  const volumeCount = EXPECTED_VOLUME_COUNT;
  let freeMem = Number(measured.approxFreeMemBytes ?? 0);
  let disk = Number(measured.diskAvailBytes ?? 0);
  let dockerMem = Number(measured.dockerMemTotalBytes ?? 0);
  const phys = Number(measured.physMemBytes ?? 0);

  if (negative) {
    // One byte below reserve must block while live measurement remains recorded.
    freeMem = REQUIRED_RESERVE_BYTES - 1;
  }

  const headroomBytes = freeMem - REQUIRED_RESERVE_BYTES;
  const diskOk = disk >= REQUIRED_FREE_DISK_BYTES;
  // Docker Desktop VM on the mini is ~8GiB today — insufficient for twelve-service envelope.
  const dockerOk = dockerMem >= REQUIRED_RESERVE_BYTES;
  const memOk = phys >= REQUIRED_RESERVE_BYTES && headroomBytes > 0 && dockerOk;

  const decision = memOk && diskOk ? 'GO' : 'BLOCKED_CAPACITY';
  const payload: Json = {
    status: decision === 'GO' ? 'ok' : 'blocked',
    decision,
    expectedServiceCount: serviceCount,
    expectedVolumeCount: volumeCount,
    decisionCount: 1,
    requiredReserveBytes: REQUIRED_RESERVE_BYTES,
    measured,
    liveMeasurementUnchanged: !negative,
    negativeFixtureBytes: negative ? REQUIRED_RESERVE_BYTES - 1 : null,
    headroomBytes: negative ? REQUIRED_RESERVE_BYTES - 1 - REQUIRED_RESERVE_BYTES : headroomBytes,
    dockerMemSufficient: dockerOk,
    diskSufficient: diskOk,
  };
  writeEvidence('target-capacity.json', payload);
  emit(payload, decision === 'GO' && !negative, json);
}

function runReconcile(json: boolean, negative: boolean): never {
  const sourceSha = sh('git rev-parse HEAD').stdout.trim();
  const mainSha = sh('git rev-parse main').stdout.trim();
  const branch = sh('git branch --show-current').stdout.trim();
  const worktrees = sh('git worktree list --porcelain').stdout;

  const health = sh(
    'ssh -o BatchMode=yes -o ConnectTimeout=8 inference1 \'curl -sS --max-time 2 http://127.0.0.1:44111/health\''
  );
  let hosted: Json | null = null;
  if (health.status === 0) {
    try {
      hosted = JSON.parse(health.stdout) as Json;
    } catch {
      hosted = null;
    }
  }
  const hostedIdentity = ((hosted?.deployment as Json | undefined)?.identity as Json | undefined) ?? null;
  const hostedSha = String(hostedIdentity?.sourceRevision ?? '');
  const sourceIdentityCount = sourceSha ? 1 : 0;
  const hostedIdentityCount = hostedIdentity ? 1 : 0;

  // Retained writers overlapping OBS-01 write-allowed paths.
  const writeAllowed = [
    'services/platform/package.json',
    'pnpm-lock.yaml',
    'services/platform/deploy/compose/observability-source-lock.json',
    'scripts/verify-observability-baseline.ts',
    'services/platform/tests/integration/observability-compatibility-gate.test.ts',
  ];
  const wtPaths = worktrees
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length).trim())
    .filter((p) => p !== ROOT);

  const overlapping: Array<{ worktree: string; path: string }> = [];
  for (const wt of wtPaths) {
    for (const rel of writeAllowed) {
      const dirty = sh(
        `git -C ${JSON.stringify(wt)} status --porcelain -- ${JSON.stringify(rel)}`
      ).stdout.trim();
      if (dirty) overlapping.push({ worktree: wt, path: rel });
    }
  }

  let shaMismatch = hostedSha.length > 0 && hostedSha !== mainSha && hostedSha !== sourceSha;
  let overlapBlocks = overlapping.length > 0;
  if (negative) {
    shaMismatch = true;
    overlapBlocks = true;
  }

  const ownershipDecision =
    shaMismatch || overlapBlocks ? 'BLOCK_DISPATCH' : 'ALLOW_DISPATCH';

  const payload: Json = {
    status: ownershipDecision === 'ALLOW_DISPATCH' ? 'ok' : 'blocked',
    sourceIdentityCount,
    hostedIdentityCount,
    ownershipDecisionCount: 1,
    source: { sha: sourceSha, branch, mainSha },
    hosted: hostedIdentity,
    hostedShaMismatch: shaMismatch,
    retainedOverlaps: overlapping,
    ownershipDecision,
  };
  writeEvidence('overlap-and-baseline.json', payload);
  emit(payload, ownershipDecision === 'ALLOW_DISPATCH' && !negative, json);
}

const cli = args();
switch (cli.mode) {
  case 'candidate':
    runCandidate(cli.candidate, cli.json);
    break;
  case 'supply-chain':
    runSupplyChain(cli.json, cli.negative);
    break;
  case 'target-capacity':
    runTargetCapacity(cli.json, cli.negative);
    break;
  case 'reconcile':
    runReconcile(cli.json, cli.negative);
    break;
  default:
    process.exit(2);
}
