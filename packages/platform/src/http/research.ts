/**
 * Research HTTP surface — server-authoritative cancel latch.
 */
import type { Context } from 'hono';
import { cancelResearchSession } from '../research/kickoff.ts';

export async function cancelResearchFromHttp(sessionId: string): Promise<{
  sessionId: string;
  status: 'cancelled';
  cancelRequestedAt: string;
  latched: boolean;
} | null> {
  const result = await cancelResearchSession(sessionId);
  if (!result.ok) {
    if (result.error.includes('not found')) return null;
    throw new Error(result.error);
  }
  return {
    sessionId: result.sessionId,
    status: result.status,
    cancelRequestedAt: result.cancelRequestedAt,
    latched: result.latched,
  };
}

export async function handleResearchCancel(c: Context): Promise<Response> {
  const id = c.req.param('id');
  try {
    const result = await cancelResearchFromHttp(id);
    if (!result) {
      return c.json({ error: 'not_found', message: 'research session not found' }, 404);
    }
    return c.json(result, 200);
  } catch (error) {
    return c.json(
      {
        error: 'research_cancel_error',
        message: error instanceof Error ? error.message : String(error),
      },
      422
    );
  }
}
