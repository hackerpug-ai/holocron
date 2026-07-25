import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('drawer deletion navigation', () => {
  it('treats a deep-linked chat route as active before choosing deletion fallback', () => {
    const drawer = readFileSync(join(process.cwd(), 'app', '(drawer)', '_layout.tsx'), 'utf8');

    expect(drawer).toContain('const match = pathname.match(/^\\/chat\\/([^/]+)$/);');
    expect(drawer).toContain(
      'const isDeletingActive = conversationId === (routeConversationId ?? activeConversationId);'
    );
  });
});
