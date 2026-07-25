import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('conversation chat header', () => {
  it('renders the current durable conversation title', () => {
    const screen = readFileSync(
      join(process.cwd(), 'app', '(drawer)', 'chat', '[conversationId].tsx'),
      'utf8'
    );

    expect(screen).toContain(
      "title={isNewConversation ? 'New chat' : (conversationRow?.title ?? 'Conversation')}"
    );
  });
});
