import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorContract, serializeContractYaml } from '../../sync/client-data-contract-author';
import {
  type VerifyReport,
  verifyE2ELinks,
  verifySchema,
  verifyTargets,
} from '../../sync/client-data-contract-verify';

/**
 * S-CONTRACT-02 — integration tests for `holo verify:client-contract`.
 *
 * The verify command reads the YAML emitted by `client-contract:author` plus
 * the S-CONTRACT-01 inventory and asserts the four ACs. These tests
 * synthesize a tiny inventory + contract to prove the verifier fail-closes
 * on disconnected, missing, stale, or malformed inputs (the AC negative
 * controls).
 */

interface InventoryCallSite {
  call_site_id: string;
  source_path: string;
  line: number;
  column: number;
  hook_kind: 'useQuery' | 'useMutation' | 'useAction';
  legacy_ref: string;
}

function writeInventory(path: string, callSites: InventoryCallSite[]): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        source_roots: ['app', 'components', 'hooks', 'screens'],
        schema_version: 1,
        counting_rule: 'test',
        summary: { file_count: 1, call_site_count: callSites.length },
        call_sites: callSites,
      },
      null,
      2
    ),
    'utf8'
  );
}

function writeContract(path: string, contract: ReturnType<typeof authorContract>): void {
  writeFileSync(path, serializeContractYaml(contract), 'utf8');
}

/**
 * Seed inventory that covers all five AC-4 offline/conflict behavior cases
 * using the smallest possible fixture (mirrors the author test fixture).
 */
const SEED_SITES: InventoryCallSite[] = [
  {
    call_site_id: 'a000000000000001',
    source_path: 'app/chat.tsx',
    line: 1,
    column: 1,
    hook_kind: 'useQuery',
    legacy_ref: 'api.chatMessages.queries.listByConversation',
  },
  {
    call_site_id: 'a000000000000002',
    source_path: 'app/chat.tsx',
    line: 2,
    column: 1,
    hook_kind: 'useMutation',
    legacy_ref: 'api.conversations.mutations.update',
  },
  {
    call_site_id: 'a000000000000003',
    source_path: 'app/chat.tsx',
    line: 3,
    column: 1,
    hook_kind: 'useAction',
    legacy_ref: 'api.chat.index.send',
  },
  {
    call_site_id: 'a000000000000004',
    source_path: 'app/chat.tsx',
    line: 4,
    column: 1,
    hook_kind: 'useMutation',
    legacy_ref: 'api.improvements.mutations.generateUploadUrl',
  },
  {
    call_site_id: 'a000000000000005',
    source_path: 'app/chat.tsx',
    line: 5,
    column: 1,
    hook_kind: 'useAction',
    legacy_ref: 'api.audio.actions.regenerateForDocument',
  },
];

describe('verify:client-contract — round-trip against authored contract', () => {
  const tmpRoot = join(
    tmpdir(),
    `holo-verify-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const invPath = join(tmpRoot, 'inv.json');
  const contractPath = join(tmpRoot, 'contract.yaml');

  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeInventory(invPath, SEED_SITES);
    const contract = authorContract({ inventoryPath: invPath });
    writeContract(contractPath, contract);
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('--schema passes on a freshly authored contract (AC-2)', () => {
    const r = verifySchema(contractPath, invPath);
    expect(r.ok).toBe(true);
    expect(r.schema?.entries_checked).toBe(SEED_SITES.length);
    expect(r.schema?.missing_target).toBe(0);
    expect(r.schema?.missing_offline).toBe(0);
    expect(r.schema?.missing_optimistic).toBe(0);
    expect(r.schema?.missing_conflict).toBe(0);
    expect(r.schema?.missing_rejection).toBe(0);
    expect(r.schema?.missing_identifier).toBe(0);
  });

  it('--targets passes on a freshly authored contract (AC-3)', () => {
    const r = verifyTargets(contractPath, invPath);
    expect(r.ok).toBe(true);
    expect(r.targets?.targets_checked).toBe(SEED_SITES.length);
    expect(r.targets?.resolved).toBe(SEED_SITES.length);
    expect(r.targets?.unresolved_target_count).toBe(0);
    expect(r.targets?.live_zero_pub_tables_count).toBeGreaterThan(0);
    expect(r.targets?.live_hono_routes_count).toBeGreaterThan(0);
  });

  it('--e2e-links passes on a freshly authored contract (AC-4)', () => {
    const r = verifyE2ELinks(contractPath, invPath);
    expect(r.ok).toBe(true);
    expect(r.e2e_links?.links_checked).toBe(SEED_SITES.length);
    expect(r.e2e_links?.invalid_e2e_link_count).toBe(0);
    expect(r.e2e_links?.offline_behavior_case_count).toBe(5);
    expect(r.e2e_links?.offline_cases_missing).toEqual([]);
  });
});

describe('verify:client-contract — negative controls', () => {
  const tmpRoot = join(
    tmpdir(),
    `holo-verify-neg-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const invPath = join(tmpRoot, 'inv.json');
  const contractPath = join(tmpRoot, 'contract.yaml');

  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeInventory(invPath, SEED_SITES);
    writeContract(contractPath, authorContract({ inventoryPath: invPath }));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('--schema fails on an empty entries array (loadContract fail-closed)', () => {
    const empty = join(tmpRoot, 'empty.yaml');
    writeFileSync(empty, 'contract_version: 1\nentries: []\n', 'utf8');
    expect(() => verifySchema(empty, invPath)).toThrow(/no entries array/);
  });

  it('--schema detects an orphan inventory call_site_id', () => {
    // Inventory with one extra ID that the contract does not cover.
    const orphanInv = join(tmpRoot, 'orphan.json');
    writeInventory(orphanInv, [
      ...SEED_SITES,
      {
        call_site_id: 'orphan0000000001',
        source_path: 'app/orphan.tsx',
        line: 99,
        column: 1,
        hook_kind: 'useQuery',
        legacy_ref: 'api.conversations.index.list',
      },
    ]);
    const r = verifySchema(contractPath, orphanInv);
    expect(r.ok).toBe(false);
    expect(r.schema?.sample_violations.some((v) => v.includes('orphan0000000001'))).toBe(true);
  });

  it('--schema detects a missing required nested field (target)', () => {
    // Strip the `target` block off one entry and re-emit the YAML.
    const c = authorContract({ inventoryPath: invPath });
    const tampered = {
      ...c,
      entries: c.entries.map((e, i) => (i === 0 ? { ...e, target: undefined } : e)),
    };
    const bad = join(tmpRoot, 'bad.yaml');
    // Emit minimal YAML by hand to avoid depending on the serializer for
    // malformed shapes.
    writeFileSync(bad, serializeContractYaml(tampered as never), 'utf8');
    const r = verifySchema(bad, invPath);
    expect(r.ok).toBe(false);
    expect(r.schema?.missing_target).toBeGreaterThan(0);
  });

  it('--targets fails when a target references a stale table', () => {
    const c = authorContract({ inventoryPath: invPath });
    // Rewrite one entry's target.table to an EXCLUDED table.
    const tampered = {
      ...c,
      entries: c.entries.map((e, i) =>
        i === 0
          ? {
              ...e,
              target: {
                ...e.target,
                kind: 'zero_query',
                table: 'toolbelt_tools',
                name: 'bogus',
                route: null,
              },
            }
          : e
      ),
    };
    const bad = join(tmpRoot, 'stale.yaml');
    writeFileSync(bad, serializeContractYaml(tampered as never), 'utf8');
    const r = verifyTargets(bad, invPath);
    expect(r.ok).toBe(false);
    expect(r.targets?.unresolved_target_count).toBe(1);
    expect(r.targets?.unresolved_targets[0]?.evidence).toContain('not in zero_pub');
  });

  it('--e2e-links fails when an invalid T-SYNC criterion is linked', () => {
    const c = authorContract({ inventoryPath: invPath });
    const tampered = {
      ...c,
      entries: c.entries.map((e, i) => (i === 0 ? { ...e, e2e_criterion: 'T-SYNC-BOGUS' } : e)),
    };
    const bad = join(tmpRoot, 'bogus-criterion.yaml');
    writeFileSync(bad, serializeContractYaml(tampered as never), 'utf8');
    const r = verifyE2ELinks(bad, invPath);
    expect(r.ok).toBe(false);
    expect(r.e2e_links?.invalid_e2e_link_count).toBe(1);
    expect(r.e2e_links?.invalid_links[0]?.criterion).toBe('T-SYNC-BOGUS');
  });
});

describe('verify:client-contract — VerifyReport shape', () => {
  const tmpRoot = join(tmpdir(), `holo-verify-shape-${Date.now()}`);
  const invPath = join(tmpRoot, 'inv.json');
  const contractPath = join(tmpRoot, 'contract.yaml');

  beforeAll(() => {
    mkdirSync(tmpRoot, { recursive: true });
    writeInventory(invPath, SEED_SITES);
    writeContract(contractPath, authorContract({ inventoryPath: invPath }));
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('every report carries contract_path, inventory_path, and check name', () => {
    const reports: VerifyReport[] = [
      verifySchema(contractPath, invPath),
      verifyTargets(contractPath, invPath),
      verifyE2ELinks(contractPath, invPath),
    ];
    for (const r of reports) {
      expect(r.contract_path).toBe(contractPath);
      expect(r.inventory_path).toBe(invPath);
      expect(['schema', 'targets', 'e2e-links']).toContain(r.check);
    }
  });
});
