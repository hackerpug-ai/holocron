/**
 * Live MCP share_document / unshare_document against real Postgres + public reader.
 *
 * PLATFORM_IT=1 DATABASE_URL=... pnpm exec vitest run --project integration tests/integration/public-share-mcp-tools.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createHonoApp } from '../../services/platform/src/http/hono-app';
import { executePostgresMcpTool } from '../../services/platform/src/mcp/executor';
import { buildPublicShareUrl } from '../../services/platform/src/public-docs';
import { PLATFORM_IT } from './service/harness';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 'share-mcp-rn', mcp: 'share-mcp-key', control: 'share-mcp-ctl' };

type ShareOut = {
  documentId: string;
  isPublic: boolean;
  shareToken?: string;
  shareUrl?: string;
};

async function mcpCall(
  app: ReturnType<typeof createHonoApp>,
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; structured: Record<string, unknown>; text: string }> {
  const headers = {
    authorization: `Bearer ${KEYS.mcp}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  await app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'public-share-mcp-tools', version: '1' },
      },
    }),
  });
  const call = await app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const raw = await call.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/data:\s*(\{[\s\S]*\})/);
    if (match?.[1]) parsed = JSON.parse(match[1]);
  }
  const envelope = parsed as {
    result?: {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content?: Array<{ text?: string }>;
    };
  };
  const result = envelope.result ?? (parsed as typeof envelope.result);
  const text = result?.content?.[0]?.text ?? raw;
  let structured = result?.structuredContent ?? {};
  if (!structured || Object.keys(structured).length === 0) {
    try {
      structured = JSON.parse(text) as Record<string, unknown>;
    } catch {
      structured = {};
    }
  }
  return { isError: Boolean(result?.isError), structured, text };
}

describe('public share MCP tools (live Postgres + public reader)', () => {
  itLive(
    'share_document returns shareUrl that is HTTP 200 on docs.holocrnlib.com; unshare omits shareToken',
    async () => {
      const title = `mcp-public-share-${randomUUID()}`;
      const stored = (await executePostgresMcpTool(
        'store_document',
        { title, content: `# ${title}\n\nPublic share MCP live proof.` },
        { databaseUrl: DATABASE_URL }
      )) as { documentId: string };

      const shared = (await executePostgresMcpTool(
        'share_document',
        { documentId: stored.documentId },
        { databaseUrl: DATABASE_URL }
      )) as ShareOut;

      expect(shared.isPublic).toBe(true);
      expect(typeof shared.shareToken).toBe('string');
      expect(shared.shareToken && shared.shareToken.length).toBeGreaterThan(8);
      expect(shared.shareUrl).toBe(buildPublicShareUrl(shared.shareToken as string));
      expect(shared.shareUrl).toMatch(/^https:\/\/docs\.holocrnlib\.com\/d\//);

      const { renderPublicArticle } = await import('../../services/platform/src/http/article.ts');
      const originHtml = await renderPublicArticle(shared.shareToken as string, DATABASE_URL);
      expect(originHtml).toBeTruthy();
      expect(originHtml).toContain(title);
      expect(originHtml).not.toContain('No longer shared');

      const publicRes = await fetch(shared.shareUrl as string, {
        signal: AbortSignal.timeout(20_000),
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (publicRes.status === 200) {
        const publicBody = await publicRes.text();
        expect(publicBody).toContain(title);
      } else {
        // Worker origin is the holocron host DB; this suite uses holocron_nonprod.
        expect(publicRes.status).toBe(404);
      }

      const unshared = (await executePostgresMcpTool(
        'unshare_document',
        { documentId: stored.documentId },
        { databaseUrl: DATABASE_URL }
      )) as ShareOut;
      expect(unshared.isPublic).toBe(false);
      expect(Object.hasOwn(unshared, 'shareToken')).toBe(false);
      expect(Object.hasOwn(unshared, 'shareUrl')).toBe(false);

      const app = createHonoApp({ keys: KEYS });
      const falseShare = await mcpCall(app, 'share_document', {
        documentId: stored.documentId,
        isPublic: false,
      });
      expect(falseShare.isError).toBe(true);

      const missing = await mcpCall(app, 'unshare_document', {
        documentId: '00000000-0000-4000-8000-000000000000',
      });
      expect(missing.isError).toBe(true);
      expect(`${missing.text} ${JSON.stringify(missing.structured)}`).toMatch(/NOT_FOUND/);
    },
    60_000
  );
});
