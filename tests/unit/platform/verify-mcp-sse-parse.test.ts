import { describe, expect, it } from 'vitest';
import { parseMcpResponseEnvelope } from '../../../services/platform/src/deploy/verify-production';

/**
 * imp-mcp-schema-drift-hardening follow-up: mcpDiscovery's initialize/tools/list
 * parse could never handle SSE-framed responses (the server's default when the
 * request advertises Accept: text/event-stream), so the discovery gate ran
 * toolInvocations: 0 forever. These fixtures pin both framings.
 */
describe('parseMcpResponseEnvelope', () => {
  const envelope = {
    jsonrpc: '2.0',
    id: 2,
    result: { tools: [{ name: 'store_document' }] },
  };

  it('parses a plain JSON body', () => {
    const out = parseMcpResponseEnvelope(JSON.stringify(envelope), 'test');
    expect(out).toEqual(envelope);
  });

  it('parses an SSE-framed body (event + data lines)', () => {
    const sse = `event: message\ndata: ${JSON.stringify(envelope)}\n\n`;
    const out = parseMcpResponseEnvelope(sse, 'test');
    expect(out).toEqual(envelope);
  });

  it('parses an SSE body with CRLF line endings and multiple events (takes last data)', () => {
    const first = { jsonrpc: '2.0', id: 1, result: { stale: true } };
    const sse = `event: message\r\ndata: ${JSON.stringify(first)}\r\n\r\nevent: message\r\ndata: ${JSON.stringify(envelope)}\r\n\r\n`;
    const out = parseMcpResponseEnvelope(sse, 'test');
    expect(out).toEqual(envelope);
  });

  it('refuses a body that is neither JSON nor an SSE data stream', () => {
    expect(() => parseMcpResponseEnvelope('<html>Access challenge</html>', 'test')).toThrow(
      /neither JSON nor an SSE data stream/,
    );
  });

  it('refuses SSE framing whose data payload is not JSON', () => {
    expect(() => parseMcpResponseEnvelope('event: message\ndata: not-json\n\n', 'test')).toThrow(
      /SSE data payload failed JSON\.parse/,
    );
  });

  it('refuses plain text that is not JSON', () => {
    expect(() => parseMcpResponseEnvelope('hello', 'test')).toThrow(
      /neither JSON nor an SSE data stream/,
    );
  });

  it('refuses a JSON-looking body that fails to parse', () => {
    expect(() => parseMcpResponseEnvelope('{broken', 'test')).toThrow(/failed JSON\.parse/);
  });
});
