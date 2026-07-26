/**
 * RED stub for S-UPLOAD-03 — intentionally fails closed until GREEN restores the
 * real Postgres-backed verifier.
 */
export async function verifyLastUploadedBlob(_options?: {
  databaseUrl?: string;
  blobRoot?: string;
}) {
  return {
    ok: false,
    rowCount: 0,
    fixtureSha256: null,
    fixtureChecked: false,
    row: null,
    reason: 'RED stub: verify:blob --last not implemented',
  };
}

export async function verifyUploadOrphans(_options?: { databaseUrl?: string; blobRoot?: string }) {
  return {
    ok: false,
    orphanCount: -1,
    orphans: [],
    reason: 'RED stub: verify:blob --orphans not implemented',
  };
}
