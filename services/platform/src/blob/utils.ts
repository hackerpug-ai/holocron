/** Shared hashing + MIME helpers for export validation, BlobStore, and uploads. */
import { createHash } from 'node:crypto';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function detectMimeFromBuffer(bytes: Buffer, filename = ''): string {
  const normalizedName = filename.toLowerCase();

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
  if (bytes.length >= 6) {
    const header = bytes.slice(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }
  if (
    bytes.length >= 12 &&
    bytes.slice(0, 4).toString('ascii') === 'RIFF' &&
    bytes.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 5 && bytes.slice(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    bytes.length >= 12 &&
    bytes.slice(0, 4).toString('ascii') === 'RIFF' &&
    bytes.slice(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'fLaC') {
    return 'audio/flac';
  }
  if (bytes.length >= 3 && bytes.slice(0, 3).toString('ascii') === 'ID3') {
    return 'audio/mpeg';
  }
  // MP3 streams may begin directly with an MPEG frame rather than an ID3 tag.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  if (normalizedName.endsWith('.mp3')) return 'audio/mpeg';
  if (normalizedName.endsWith('.wav')) return 'audio/wav';
  if (normalizedName.endsWith('.pdf')) return 'application/pdf';
  if (normalizedName.endsWith('.txt')) return 'text/plain';
  if (normalizedName.endsWith('.json') || normalizedName.endsWith('.jsonl')) {
    return 'application/json';
  }

  let printable = true;
  for (const byte of bytes) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte > 0x7e) {
      printable = false;
      break;
    }
  }
  if (printable) return 'text/plain';
  return 'application/octet-stream';
}
