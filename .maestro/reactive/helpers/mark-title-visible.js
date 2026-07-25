// Marks the wall-clock moment the app reflected the MCP-updated title (t1).
// Duration = t1 - t0 is stored server-side for p95 over >=5 iterations.
//
// Env:
//   TITLE                — must match update-document-via-mcp expectedTitle
//   MCP_SYNC_SERVER_URL  — helper base (default http://127.0.0.1:8766)

const title =
  typeof TITLE !== 'undefined' && TITLE
    ? String(TITLE)
    : typeof expectedTitle !== 'undefined' && expectedTitle
      ? String(expectedTitle)
      : '';
const base =
  typeof MCP_SYNC_SERVER_URL !== 'undefined' && MCP_SYNC_SERVER_URL
    ? MCP_SYNC_SERVER_URL
    : 'http://127.0.0.1:8766';

if (!title) {
  throw new Error('mark-title-visible: TITLE env required');
}

const url = `${base}/mark-visible?title=${encodeURIComponent(title)}`;
const res = http.get(url);
output.markUrl = url;
output.markStatus = res.status;
output.markBody = res.body;

if (res.status !== 200) {
  throw new Error(`mark-visible failed status=${res.status} body=${res.body}`);
}

let parsed = null;
try {
  parsed = JSON.parse(res.body);
} catch {
  throw new Error(`mark-visible non-JSON body=${res.body}`);
}
output.durationMs = String(parsed.duration_ms);
output.sampleCount = String(parsed.n);
