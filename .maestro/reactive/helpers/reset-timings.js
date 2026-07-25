// Clears timing samples before a multi-iteration p95 run.
// Env: MCP_SYNC_SERVER_URL (default http://127.0.0.1:8766)

const base =
  typeof MCP_SYNC_SERVER_URL !== 'undefined' && MCP_SYNC_SERVER_URL
    ? MCP_SYNC_SERVER_URL
    : 'http://127.0.0.1:8766';

const url = `${base}/reset`;
const res = http.get(url);
output.resetUrl = url;
output.resetStatus = res.status;
output.resetBody = res.body;
if (res.status !== 200) {
  throw new Error(`reset timings failed status=${res.status} body=${res.body}`);
}
