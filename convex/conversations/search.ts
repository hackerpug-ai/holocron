import { v } from 'convex/values';
import { query } from '../_generated/server';

/**
 * Search conversations by title and message content.
 * Combines results from both search indexes, deduplicates, and sorts by updatedAt.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query: searchQuery, limit = 50 }) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];

    const seen = new Set<string>();

    // Search by conversation title
    const titleMatches = await ctx.db
      .query('conversations')
      .withSearchIndex('search_title', (q) => q.search('title', trimmed))
      .take(limit);

    for (const c of titleMatches) {
      seen.add(c._id);
    }

    // Search by message content, collect unique conversation IDs
    const messageMatches = await ctx.db
      .query('chatMessages')
      .withSearchIndex('search_content', (q) => q.search('content', trimmed))
      .take(limit * 2);

    const unseenIds = Array.from(
      new Set(messageMatches.map((m) => m.conversationId).filter((id) => !seen.has(id)))
    );

    // Fetch conversations found only through message content
    const contentMatches = await Promise.all(unseenIds.map((id) => ctx.db.get(id)));

    const all = [...titleMatches];
    for (const conv of contentMatches) {
      if (conv) {
        seen.add(conv._id);
        all.push(conv);
      }
    }

    all.sort((a, b) => b.updatedAt - a.updatedAt);
    return all.slice(0, limit);
  },
});
