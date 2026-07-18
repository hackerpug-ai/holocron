/** Filesystem-backed content-addressed BlobStore with atomic temp-file promotion. */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { detectMimeFromBuffer, isSha256Hex, sha256Hex } from './utils.ts';

export interface PutBlobOptions {
  expectedSha256?: string;
  expectedByteLength?: number;
  expectedMimeType?: string;
  filename?: string;
}

export interface PutBlobResult {
  sha256: string;
  byteLength: number;
  mimeType: string;
  path: string;
  relativePath: string;
  created: boolean;
}

export interface BlobMetadata {
  sha256: string;
  byteLength: number;
  mimeType: string;
  path: string;
  relativePath: string;
}

export function defaultBlobRoot(cwd = process.cwd()): string {
  return resolve(process.env.HOLO_BLOB_ROOT ?? join(cwd, '.tmp', 'holocron-blobs'));
}

function blobRelativePath(sha256: string): string {
  return join(sha256.slice(0, 2), sha256.slice(2, 4), sha256);
}

export class BlobStore {
  readonly root: string;

  constructor(root = defaultBlobRoot()) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }

  resolvePath(sha256: string): string {
    if (!isSha256Hex(sha256)) {
      throw new Error(`BlobStore: invalid sha256 digest: ${sha256}`);
    }
    return join(this.root, blobRelativePath(sha256));
  }

  metadataFor(sha256: string): BlobMetadata {
    const path = this.resolvePath(sha256);
    const bytes = readFileSync(path);
    return {
      sha256,
      byteLength: bytes.length,
      mimeType: detectMimeFromBuffer(bytes, sha256),
      path,
      relativePath: relative(this.root, path),
    };
  }

  exists(sha256: string): boolean {
    return existsSync(this.resolvePath(sha256));
  }

  get(sha256: string): Buffer {
    return readFileSync(this.resolvePath(sha256));
  }

  stream(sha256: string) {
    return createReadStream(this.resolvePath(sha256));
  }

  delete(sha256: string): void {
    const path = this.resolvePath(sha256);
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }

  async put(bytes: Buffer, options: PutBlobOptions = {}): Promise<PutBlobResult> {
    const sha256 = sha256Hex(bytes);
    const byteLength = bytes.length;
    const mimeType = detectMimeFromBuffer(bytes, options.filename ?? sha256);

    if (options.expectedSha256 && options.expectedSha256 !== sha256) {
      throw new Error(
        `BlobStore.put digest mismatch: expected ${options.expectedSha256}, got ${sha256}`
      );
    }
    if (options.expectedByteLength !== undefined && options.expectedByteLength !== byteLength) {
      throw new Error(
        `BlobStore.put byte-length mismatch: expected ${options.expectedByteLength}, got ${byteLength}`
      );
    }
    if (options.expectedMimeType && options.expectedMimeType !== mimeType) {
      throw new Error(
        `BlobStore.put MIME mismatch: expected ${options.expectedMimeType}, got ${mimeType}`
      );
    }

    const path = this.resolvePath(sha256);
    const relativePath = relative(this.root, path);
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });

    if (existsSync(path)) {
      const onDisk = readFileSync(path);
      const onDiskSha = sha256Hex(onDisk);
      if (onDiskSha !== sha256 || onDisk.length !== byteLength) {
        throw new Error(`BlobStore.put existing digest path corrupted: ${path}`);
      }
      return {
        sha256,
        byteLength,
        mimeType,
        path,
        relativePath,
        created: false,
      };
    }

    const tempPath = join(dir, `.${sha256}.tmp-${process.pid}-${Date.now()}`);
    writeFileSync(tempPath, bytes, { flag: 'wx' });

    try {
      const tempBytes = readFileSync(tempPath);
      if (sha256Hex(tempBytes) !== sha256 || tempBytes.length !== byteLength) {
        throw new Error(`BlobStore.put temp verification failed for ${tempPath}`);
      }
      if (existsSync(path)) {
        await unlink(tempPath).catch(() => {});
        const existing = readFileSync(path);
        if (sha256Hex(existing) !== sha256 || existing.length !== byteLength) {
          throw new Error(`BlobStore.put concurrent existing digest path corrupted: ${path}`);
        }
        return {
          sha256,
          byteLength,
          mimeType,
          path,
          relativePath,
          created: false,
        };
      }
      await rename(tempPath, path);
      return {
        sha256,
        byteLength,
        mimeType,
        path,
        relativePath,
        created: true,
      };
    } catch (error) {
      rmSync(tempPath, { force: true });
      throw error;
    }
  }

  async putFile(sourcePath: string, options: Omit<PutBlobOptions, 'filename'> = {}) {
    const bytes = readFileSync(sourcePath);
    return this.put(bytes, { ...options, filename: sourcePath });
  }

  url(sha256: string): string {
    return `/blobs/${sha256}`;
  }

  stat(sha256: string) {
    return statSync(this.resolvePath(sha256));
  }
}
