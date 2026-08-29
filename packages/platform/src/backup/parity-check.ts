/**
 * SHA-256 parity between local content-addressed blob store and a restic restore tree.
 *
 * CAP-BAK-01 / D04-04: parity is computed from real file contents on both sides —
 * never asserted from restic exit code alone.
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  type Stats,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';

export type HashSetResult = {
  /** Sorted unique content SHA-256 digests (hex lowercase). */
  hashes: string[];
  /** Map digest → relative paths that hash to it (debug / mismatch report). */
  byHash: Map<string, string[]>;
  /** Number of regular files hashed. */
  fileCount: number;
  root: string;
};

export type ParityCompareResult = {
  ok: boolean;
  localCount: number;
  remoteCount: number;
  /** Digests present locally but missing remotely. */
  missingRemote: string[];
  /** Digests present remotely but not locally. */
  extraRemote: string[];
  /** Equal when both sets match (count + membership). */
  equal: boolean;
};

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.DS_Store']);

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function shouldSkipName(name: string): boolean {
  if (SKIP_DIR_NAMES.has(name)) return true;
  // BlobStore temp files: .<sha>.tmp-<pid>-<ts>
  if (name.startsWith('.') && name.includes('.tmp-')) return true;
  if (name === '.DS_Store') return true;
  return false;
}

/**
 * Walk a directory tree and compute SHA-256 of every regular file's contents.
 * Paths are recorded relative to root for diagnostics only — parity is hash-set equality.
 */
export function hashDirectoryTree(root: string): HashSetResult {
  if (!existsSync(root)) {
    return { hashes: [], byHash: new Map(), fileCount: 0, root };
  }

  const byHash = new Map<string, string[]>();
  let fileCount = 0;

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (shouldSkipName(name)) continue;
      const full = join(dir, name);
      let st: Stats;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      // Skip zero-byte lock/marker files that are not blob payloads if needed;
      // content-addressed blobs may legitimately be empty — hash them.
      const bytes = readFileSync(full);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const rel = relative(root, full);
      const list = byHash.get(digest) ?? [];
      list.push(rel);
      byHash.set(digest, list);
      fileCount += 1;
    }
  };

  walk(root);
  const hashes = [...byHash.keys()].sort();
  return { hashes, byHash, fileCount, root };
}

/**
 * Hash the content-addressed blob store. Only files whose basename is a 64-hex
 * digest are required for parity of blob *objects*; other files under the root
 * (if any) are still hashed for honesty.
 *
 * Test seam (GATE-FIX-S28R3-QA4/C-1): when HOLO_TEST_BLOB_HASH_MARKER is set,
 * append a line naming the hashed root so integration tests can prove a path
 * was never traversed (fresh-target must not call this for live source roots).
 */
export function hashLocalBlobStore(blobRoot: string): HashSetResult {
  const marker = process.env.HOLO_TEST_BLOB_HASH_MARKER?.trim();
  if (marker) {
    try {
      appendFileSync(marker, `hashLocalBlobStore:${blobRoot}\n`, 'utf8');
    } catch {
      // ignore marker failures in production paths
    }
  }
  return hashDirectoryTree(blobRoot);
}

/**
 * Compare local vs remote hash sets. Equal iff same membership (order-independent).
 */
export function compareHashSets(
  local: HashSetResult | Iterable<string>,
  remote: HashSetResult | Iterable<string>
): ParityCompareResult {
  const localSet = toSet(local);
  const remoteSet = toSet(remote);
  const missingRemote: string[] = [];
  const extraRemote: string[] = [];

  for (const h of localSet) {
    if (!remoteSet.has(h)) missingRemote.push(h);
  }
  for (const h of remoteSet) {
    if (!localSet.has(h)) extraRemote.push(h);
  }
  missingRemote.sort();
  extraRemote.sort();
  const equal = missingRemote.length === 0 && extraRemote.length === 0;
  return {
    ok: equal,
    localCount: localSet.size,
    remoteCount: remoteSet.size,
    missingRemote,
    extraRemote,
    equal,
  };
}

function toSet(input: HashSetResult | Iterable<string>): Set<string> {
  if (input && typeof input === 'object' && 'hashes' in input) {
    return new Set((input as HashSetResult).hashes);
  }
  return new Set(input as Iterable<string>);
}

/**
 * Fail-closed parity assertion. Throws with structured detail when sets differ.
 */
export function assertParity(
  local: HashSetResult,
  remote: HashSetResult,
  context = 'blob mirror parity'
): ParityCompareResult {
  const result = compareHashSets(local, remote);
  if (!result.ok) {
    throw new Error(
      `${context} FAILED: local=${result.localCount} remote=${result.remoteCount} ` +
        `missing_remote=${result.missingRemote.length} extra_remote=${result.extraRemote.length} ` +
        `sample_missing=${result.missingRemote.slice(0, 3).join(',') || '-'} ` +
        `sample_extra=${result.extraRemote.slice(0, 3).join(',') || '-'}`
    );
  }
  if (result.localCount === 0) {
    throw new Error(`${context} FAILED: empty local hash set (blob store has no objects)`);
  }
  return result;
}

export function isRegularBlobFile(path: string): boolean {
  return isRegularFile(path);
}

/**
 * REDHAT-FIX-C5: SHA-256 of a sorted list of content digests (blob manifest binding).
 * Fire-drill/parity loads the full recovery baseline via recovery-baseline.ts.
 */
export function computeBlobManifestSha256FromHashes(
  sortedContentSha256: readonly string[]
): string {
  return createHash('sha256').update(sortedContentSha256.join('\n'), 'utf8').digest('hex');
}
