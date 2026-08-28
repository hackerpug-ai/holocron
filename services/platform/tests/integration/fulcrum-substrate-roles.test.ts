/**
 * FUL-INFRA-001 — Fulcrum substrate role-set readiness (integration lane).
 *
 * Proves, against the REAL inference minis (oMLX 0.5.7 on inference1 and
 * inference2 :8003 over Tailscale), that:
 *
 *   AC-1 both minis serve the full Fulcrum role set after
 *        provision-fulcrum-roles.sh ran on each node through its own SSH alias
 *        (`inference2 convergent=Muse-Glimmer-30B-4bit`, "nodes_ready":2,
 *        "roles_per_node":3, exit 0)
 *   AC-2 --clear-coder-weights retires the coder weights so neither node
 *        serves the coder basename Qwen3.6-35B-A3B-MLX-8bit and both still
 *        serve the three Fulcrum basenames
 *        (coder_basenames_served=0 fulcrum_basenames_served=6, resident_gb=46)
 *   AC-3 a stopped oMLX on inference1 is reported per node, not hidden
 *        ("unreachable_nodes":["inference1"], inference2 still reports its
 *        roles, exit=1)
 *   AC-4 a serving endpoint with a short model list fails closed by role name
 *        (FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent,
 *        present=embed, exit=1) — never on HTTP 200 liveness alone
 *   AC-5 the expected vocabulary is exactly convergent/divergent/embed with
 *        forbidden_role_hits=0 — judge and every coder role excluded (ADR-008)
 *
 * Every AC drives the real product surface, exactly as the scenario steps
 * declare:
 *   bash services/platform/deploy/fleet/provision-fulcrum-roles.sh --node <mini>
 *   bun  services/platform/src/cli/holo.ts fulcrum:substrate-check [flags]
 *
 * NEVER touches any network setting — the only degradations produced here are
 * stopping an oMLX process (AC-3, restored in finally) and starting a
 * restricted --model-dir process on a spare port (AC-4, killed in finally).
 * Credentials: key auth via the documented ~/.ssh/config aliases only; no
 * secret values are read, logged, or written.
 *
 * NEGATIVE CONTROLS (artifacts in .tmp/FUL-INFRA-001/): for each AC the same
 * assertions were executed against the empty/disconnected start and captured
 * RED (AC-*-red-against-start.txt) before the seeded GREEN (AC-*-green.txt).
 * AC-1: disconnected start (inference2's oMLX stopped over SSH) plus a
 *   short-model-list start (expectation override naming an absent basename) —
 *   a liveness-only check would pass the latter at HTTP 200. AC-2: an
 *   expectation override whose divergent basename is not served, so the tally
 *   line differs — a hardcoded tally could not diverge. AC-3: the all-up
 *   substrate, where a stopped-node assertion cannot hold. AC-4: the absent
 *   :8013 process (check reports UNREACHABLE, not a short list). AC-5: a
 *   stubbed expectation file missing `embed` (fail-closed INVALID, proving
 *   the vocabulary is read from the file, not hardcoded). A liveness-only
 *   check, a cached node status, or a hardcoded expected set cannot produce
 *   this evidence pair.
 *
 * NOTE (contract drift, resolved toward the AC's THEN): oMLX 0.5.7 rewrites
 * its process title to bare `omlx-server`, so the contract's literal stop
 * step `pkill -f "omlx serve"` matches nothing on a provisioned node. The
 * AC-3 seed therefore stops the process with BOTH the contract's pattern and
 * the DEVICES.md-documented `pkill -x omlx-server` — same degradation class
 * (stopping the oMLX process), no network setting touched.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/fulcrum-substrate-roles.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/FUL-INFRA-001');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const PROVISION_SH = resolve(
  REPO_ROOT,
  'services/platform/deploy/fleet/provision-fulcrum-roles.sh'
);
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

const DIVERGENT = 'Qwen3.8-27B-8bit';
const CONVERGENT = 'Muse-Glimmer-30B-4bit';
const EMBED = 'Qwen3-Embedding-0.6B-4bit-DWQ';
const CODER = 'Qwen3.6-35B-A3B-MLX-8bit';
const INFERENCE2_ENDPOINT = 'http://inference2.tail011a51.ts.net:8013/v1';

const itLive = (name: string, fn: () => Promise<void> | void, timeout: number): void => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

type SpawnResult = { status: number; stdout: string; stderr: string };

function runLocal(bin: string, args: string[], timeoutMs: number): SpawnResult {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: timeoutMs });
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/** Run a shell command ON the mini through its documented SSH alias. */
function runRemote(node: string, remote: string, timeoutMs = 60_000): SpawnResult {
  return runLocal(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', node, remote],
    timeoutMs
  );
}

/** The node's own provisioning entrypoint (scenario step, real surface). */
function provision(node: string, extra: string[] = []): SpawnResult {
  return runLocal('bash', [PROVISION_SH, '--node', node, ...extra], 600_000);
}

/** The real CLI surface: holo fulcrum:substrate-check [flags]. */
function substrateCheck(args: string[]): SpawnResult {
  return runLocal(BUN_BIN, [HOLO_CLI, 'fulcrum:substrate-check', ...args], 120_000);
}

/**
 * The substrate check prints human lines then ONE machine-readable JSON line;
 * the scenario asserts against both, so return them separately.
 */
function parseCheck(r: SpawnResult): { lines: string; json: Record<string, unknown> } {
  const out = (r.stdout ?? '').trim();
  const lastLine = out.split('\n').pop() ?? '';
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(lastLine) as Record<string, unknown>;
  } catch {
    json = { __parse_error: lastLine };
  }
  return { lines: out, json };
}

/** Poll a URL until fetch succeeds (or the budget runs out). */
async function waitUntilReachable(url: string, budgetMs: number, everyMs = 2000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      // still down — keep polling
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

/** Poll a URL until fetch FAILS (node/service down). */
async function waitUntilDown(url: string, budgetMs: number, everyMs = 2000): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

function capture(name: string, content: string): void {
  writeFileSync(resolve(EVIDENCE_DIR, name), content);
}

/**
 * Emit the real substrate output on the RAW process stdout. The AC verify
 * commands pipe `vitest run ... | grep -F '<line from the check>'`, and the
 * default non-TTY reporter does not render intercepted console.log output for
 * passing tests — a raw fd write is the only surface the pipe sees on a
 * passing run. (console.log is kept as well for interactive/verbose runs.)
 */
function emitForVerifyGrep(text: string): void {
  process.stdout.write(`\n${text}\n`);
}

beforeAll(() => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
});

describe('FUL-INFRA-001 — Fulcrum substrate role-set readiness (live minis)', () => {
  itLive(
    'AC-1: both minis serve the full Fulcrum role set after per-node provisioning',
    () => {
      // Seed: run the real provisioning entrypoint on EACH mini through its own
      // SSH alias so both farm + serve the three Fulcrum basenames.
      const p1 = provision('inference1');
      expect(p1.status, `provision inference1 failed:\n${p1.stdout}\n${p1.stderr}`).toBe(0);
      const p2 = provision('inference2');
      expect(p2.status, `provision inference2 failed:\n${p2.stdout}\n${p2.stderr}`).toBe(0);

      // Perform: the real CLI check, one GET to each node's own :8003/v1/models.
      const r = substrateCheck(['--json']);
      // The verify grep needs the real binding lines in the vitest stdout.
      console.log(r.stdout);
      emitForVerifyGrep(r.stdout);
      capture('AC-1-green.txt', `exit=${r.status}\n${r.stdout}\n${r.stderr}`);

      // Assert: every must_observe, verbatim.
      expect(r.status).toBe(0);
      for (const binding of [
        `inference1 divergent=${DIVERGENT}`,
        `inference2 divergent=${DIVERGENT}`,
        `inference1 convergent=${CONVERGENT}`,
        `inference2 convergent=${CONVERGENT}`,
        `inference2 embed=${EMBED}`,
        `inference1 embed=${EMBED}`,
      ]) {
        expect(r.stdout).toContain(binding);
      }
      expect(r.stdout).toContain('"nodes_ready":2');
      expect(r.stdout).toContain('"roles_per_node":3');
      expect(r.stdout).toContain('FULCRUM_SUBSTRATE_OK');

      // must_not_observe: empty/short aggregates.
      expect(r.stdout).not.toContain('"roles_per_node":0');
      expect(r.stdout).not.toContain('"nodes_ready":1');
      expect(r.stdout).not.toContain('"models":[]');
      const { json } = parseCheck(r);
      const nodes = (json.nodes ?? []) as Array<{ models: string[]; ready: boolean }>;
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        expect(node.models.length).toBeGreaterThanOrEqual(3);
        expect(node.ready).toBe(true);
      }
    },
    900_000
  );

  itLive(
    'AC-2: coder weights cleared so the Fulcrum set fits each mini',
    () => {
      // Seed: provisioning WITH --clear-coder-weights retires the coder
      // weights out of every served model root on both nodes.
      const p1 = provision('inference1', ['--clear-coder-weights']);
      expect(
        p1.status,
        `provision --clear-coder-weights inference1 failed:\n${p1.stdout}\n${p1.stderr}`
      ).toBe(0);
      const p2 = provision('inference2', ['--clear-coder-weights']);
      expect(
        p2.status,
        `provision --clear-coder-weights inference2 failed:\n${p2.stdout}\n${p2.stderr}`
      ).toBe(0);

      // Perform: tally served ids from BOTH nodes' own /v1/models responses.
      const r = substrateCheck(['--json', '--report-basenames']);
      console.log(r.stdout);
      emitForVerifyGrep(r.stdout);
      capture('AC-2-green.txt', `exit=${r.status}\n${r.stdout}\n${r.stderr}`);

      // Assert the exact seeded tally + per-node resident arithmetic (28+17+1).
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('coder_basenames_served=0 fulcrum_basenames_served=6');
      expect(r.stdout).toContain('inference1 resident_gb=46');
      expect(r.stdout).toContain('inference2 resident_gb=46');

      // must_not_observe: the coder basename anywhere in either model id list,
      // a zero fulcrum tally, or an empty basename tally.
      expect(r.stdout).not.toContain(CODER);
      expect(r.stdout).not.toContain('fulcrum_basenames_served=0');
      const { json } = parseCheck(r);
      const nodes = (json.nodes ?? []) as Array<{ models: string[]; resident_gb: number }>;
      for (const node of nodes) {
        expect(node.models.length).toBeGreaterThanOrEqual(3);
        expect(node.models).not.toContain(CODER);
        expect(node.resident_gb).toBe(46);
      }
    },
    900_000
  );

  itLive(
    'AC-3: a stopped oMLX on inference1 is reported per node, not hidden',
    async () => {
      // Seed: stop the real service on inference1 over SSH (no network setting
      // is touched), then prove inference2 still answers through its own
      // entrypoint.
      const kill = runRemote('inference1', 'pkill -f "omlx serve"; pkill -x omlx-server; true');
      expect(kill.status).toBe(0);
      const down = await waitUntilDown(
        'http://inference1.tail011a51.ts.net:8003/v1/models',
        30_000
      );
      expect(down, 'inference1 :8003 still reachable after pkill').toBe(true);
      let restoreFailure: string | null = null;
      const peer = runRemote('inference2', 'curl -sS http://127.0.0.1:8003/v1/models');
      expect(peer.status, `inference2 self-probe failed:\n${peer.stderr}`).toBe(0);
      expect(peer.stdout).toContain(CONVERGENT);

      try {
        // Perform: the real CLI check must name the dead node and exit 1.
        const r = substrateCheck(['--json']);
        console.log(r.stdout);
      emitForVerifyGrep(r.stdout);
        capture('AC-3-green.txt', `exit=${r.status}\n${r.stdout}\n${r.stderr}`);

        // Assert.
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('"unreachable_nodes":["inference1"]');
        expect(r.stdout).toContain(`inference2 convergent=${CONVERGENT}`);
        expect(r.stdout).toContain('FULCRUM_SUBSTRATE_UNREACHABLE nodes=inference1');

        // must_not_observe.
        expect(r.stdout).not.toContain('"nodes_ready":2');
        expect(r.stdout).not.toContain('"unreachable_nodes":[]');
        const { json } = parseCheck(r);
        expect(json.unreachable_nodes).toEqual(['inference1']);
        expect(json.nodes_ready).toBe(1);
      } finally {
        // Restore: re-run the node's own provisioning entrypoint so the fleet
        // is left serving the full Fulcrum set on both minis. Restore happens
        // on EVERY path; its failure is reported after the finally block so it
        // can never mask the original assertion result.
        const restore = provision('inference1');
        const back =
          restore.status === 0 &&
          (await waitUntilReachable('http://inference1.tail011a51.ts.net:8003/v1/models', 60_000));
        if (!back) {
          restoreFailure = `RESTORE FAILED: inference1 not serving after re-provision\n${restore.stdout}\n${restore.stderr}`;
        }
      }
      if (restoreFailure) throw new Error(restoreFailure);
    },
    900_000
  );

  itLive(
    'AC-4: a serving endpoint with a short model list fails closed by role name',
    async () => {
      // Seed: a REAL restricted oMLX process on inference2 :8013 whose
      // --model-dir contains only the embedding weights; :8003 untouched.
      const start = runRemote(
        'inference2',
        'nohup /opt/homebrew/bin/omlx serve --host 0.0.0.0 --port 8013 ' +
          '--model-dir "$HOME/models/mlx-community/' +
          EMBED +
          '" ' +
          '> /tmp/omlx-fulcrum-8013.log 2>&1 & echo $!'
      );
      expect(start.status, `restricted :8013 start failed:\n${start.stderr}`).toBe(0);
      const pid = start.stdout.trim();
      expect(pid).toMatch(/^\d+$/);
      let cleanupFailure: string | null = null;

      try {
        // The restricted endpoint must REALLY serve exactly the embedding id
        // before the check runs (fixture record), while :8003 keeps all three.
        const restrictedUp = await waitUntilReachable(`${INFERENCE2_ENDPOINT}/models`, 90_000);
        expect(restrictedUp, 'restricted :8013 endpoint never became reachable').toBe(true);
        const restricted = await fetch(`${INFERENCE2_ENDPOINT}/models`, {
          signal: AbortSignal.timeout(5000),
        });
        const payload = (await restricted.json()) as { data?: Array<{ id: string }> };
        const ids = (payload.data ?? []).map((m) => m.id);
        expect(ids).toEqual([EMBED]);

        // Perform: probe THAT endpoint through the real CLI.
        const r = substrateCheck(['--endpoint', INFERENCE2_ENDPOINT, '--json']);
        console.log(r.stdout);
      emitForVerifyGrep(r.stdout);
        capture('AC-4-green.txt', `exit=${r.status}\n${r.stdout}\n${r.stderr}`);

        // Assert: fails closed BY ROLE NAME, not on liveness.
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('FULCRUM_SUBSTRATE_INCOMPLETE missing=convergent,divergent');
        expect(r.stdout).toContain('present=embed');

        // must_not_observe.
        expect(r.stdout).not.toContain('"ready":true');
        expect(r.stdout).not.toContain('FULCRUM_SUBSTRATE_OK');
        const { json } = parseCheck(r);
        expect(json.ready).toBe(false);
        expect(json.missing_roles).toEqual(['convergent', 'divergent']);
      } finally {
        // Restore: kill the restricted process by recorded PID; :8003 must
        // keep serving the full Fulcrum set. Cleanup runs on EVERY path; its
        // failure is reported after the finally block so it can never mask the
        // original assertion result.
        if (pid) runRemote('inference2', `kill ${pid} 2>/dev/null; true`);
        const down = await waitUntilDown(`${INFERENCE2_ENDPOINT}/models`, 30_000);
        if (!down) {
          cleanupFailure = `RESTORE FAILED: :8013 still listening after kill ${pid}`;
        } else {
          try {
            const main = await fetch('http://inference2.tail011a51.ts.net:8003/v1/models', {
              signal: AbortSignal.timeout(5000),
            });
            const mainPayload = (await main.json()) as { data?: Array<{ id: string }> };
            const mainIds = (mainPayload.data ?? []).map((m) => m.id);
            for (const basename of [DIVERGENT, CONVERGENT, EMBED]) {
              if (!mainIds.includes(basename)) {
                cleanupFailure = `RESTORE FAILED: :8003 lost ${basename} after AC-4 cleanup`;
              }
            }
          } catch (err) {
            cleanupFailure = `RESTORE FAILED: :8003 probe errored after AC-4 cleanup: ${String(err)}`;
          }
        }
      }
      if (cleanupFailure) throw new Error(cleanupFailure);
    },
    600_000
  );

  itLive(
    'AC-5: the Fulcrum role vocabulary excludes judge and every coder role',
    () => {
      // Perform: the real CLI check against the live substrate, printing the
      // expected vocabulary and tracing every requested role name.
      const r = substrateCheck(['--print-expected', '--json', '--trace-requested-roles']);
      console.log(r.stdout);
      emitForVerifyGrep(r.stdout);
      capture('AC-5-green.txt', `exit=${r.status}\n${r.stdout}\n${r.stderr}`);

      // Assert: the expected list is EXACTLY the three Fulcrum roles, the
      // requested-role trace matches it, and the forbidden tally is a real
      // scan result of zero.
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('"expected_roles":["convergent","divergent","embed"]');
      expect(r.stdout).toContain('"requested_roles":["convergent","divergent","embed"]');
      expect(r.stdout).toContain('forbidden_role_hits=0');

      // must_not_observe: judge in expected_roles, qwen-coder in
      // requested_roles, an empty expected_roles list.
      const { json } = parseCheck(r);
      expect(json.expected_roles).toEqual(['convergent', 'divergent', 'embed']);
      expect(json.requested_roles).toEqual(['convergent', 'divergent', 'embed']);
      expect(JSON.stringify(json.expected_roles)).not.toContain('judge');
      expect(JSON.stringify(json.requested_roles)).not.toContain('qwen-coder');
      expect(json.forbidden_role_hits).toBe(0);
    },
    240_000
  );
});
