/**
 * Registry/schema contracts for public share + unshare MCP tools.
 * Live Postgres/HTTP proof: tests/integration/public-share-mcp-tools.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { PUBLIC_DOCS_ORIGIN as RnPublicDocsOrigin } from '../../app/zero/platform';
import { listTools } from '../../services/platform/src/tools/registry.ts';
import {
  shareDocumentInputSchema,
  shareDocumentOutputSchema,
  unshareDocumentInputSchema,
  unshareDocumentOutputSchema,
} from '../../services/platform/src/tools/schemas/documents.ts';
import {
  PUBLIC_DOCS_ORIGIN,
  buildPublicShareUrl,
} from '../../services/platform/src/public-docs.ts';

describe('public share MCP tool schemas', () => {
  it('registers unshare_document and a share_document that does not require isPublic', () => {
    const ids = listTools().map((row) => row.id);
    expect(ids).toContain('share_document');
    expect(ids).toContain('unshare_document');

    const shareOnly = shareDocumentInputSchema.safeParse({
      documentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(shareOnly.success).toBe(true);

    const unshareFalse = shareDocumentInputSchema.safeParse({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: false,
    });
    expect(unshareFalse.success).toBe(false);

    const unshareIn = unshareDocumentInputSchema.safeParse({
      documentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(unshareIn.success).toBe(true);
  });

  it('share success requires shareUrl; unshare success omits shareToken', () => {
    const token = 'mcp-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const shared = shareDocumentOutputSchema.safeParse({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: true,
      shareToken: token,
      shareUrl: buildPublicShareUrl(token),
    });
    expect(shared.success).toBe(true);

    const missingUrl = shareDocumentOutputSchema.safeParse({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: true,
      shareToken: token,
    });
    expect(missingUrl.success).toBe(false);

    const unshared = unshareDocumentOutputSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: false,
    });
    expect(unshared).toEqual({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: false,
    });

    const stripped = unshareDocumentOutputSchema.parse({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: false,
      shareToken: null,
    });
    expect(stripped).toEqual({
      documentId: '11111111-1111-4111-8111-111111111111',
      isPublic: false,
    });
    expect(Object.hasOwn(stripped, 'shareToken')).toBe(false);
  });

  it('platform and RN public origins are the same docs.holocrnlib.com host', () => {
    expect(PUBLIC_DOCS_ORIGIN).toBe('https://docs.holocrnlib.com');
    expect(RnPublicDocsOrigin).toBe(PUBLIC_DOCS_ORIGIN);
    expect(buildPublicShareUrl('tok-abc')).toBe('https://docs.holocrnlib.com/d/tok-abc');
  });
});
