/** Shared hashing + MIME helpers for export validation, BlobStore, and uploads. */
import { createHash } from 'node:crypto';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function detectMimeFromBuffer(bytes: Buffer, filename = ''): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac';
  }
  if (bytes.length >= 3 && bytes.slice(0, 3).toString('ascii') === 'ID3') {
    return 'audio/mpeg';
  }
  if (filename.endsWith('.mp3')) return 'audio/mpeg';
  if (filename.endsWith('.json') || filename.endsWith('.jsonl')) return 'application/json';

  const asText = bytes.toString('utf8');
  let printable = true;
  for (let i = 0; i < asText.length; i++) {
    const code = asText.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code < 0x20 || code > 0x7e) {
      printable = false;
      break;
    }
  }
  if (printable) return 'text/plain';
  return 'application/octet-stream';
}
