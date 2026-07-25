// Asserts cross-surface sync p95 <= 5000ms over >=5 real timing samples.
// Calls mcp-sync-server /p95 which uses nearest-rank percentile (not hardcoded).
//
// Env:
//   MCP_SYNC_SERVER_URL  — helper base (default http://127.0.0.1:8766)
//   SYNC_SLO_MS          — threshold (default 5000); asserted, never forced pass

const base =
  typeof MCP_SYNC_SERVER_URL !== 'undefined' && MCP_SYNC_SERVER_URL
    ? MCP_SYNC_SERVER_URL
    : 'http://127.0.0.1:8766';
const sloMs = typeof SYNC_SLO_MS !== 'undefined' && SYNC_SLO_MS ? String(SYNC_SLO_MS) : '5000';

const url = `${base}/p95`;
const res = http.get(url);
output.p95Url = url;
output.p95Status = res.status;
output.p95Body = res.body;
output.sloMs = sloMs;

if (res.status !== 200) {
  throw new Error(
    `p95 SLO failed status=${res.status} body=${res.body} (assert p95_ms <= ${sloMs})`
  );
}

let parsed = null;
try {
  parsed = JSON.parse(res.body);
} catch {
  throw new Error(`p95 non-JSON body=${res.body}`);
}

output.p95Ms = String(parsed.p95_ms);
output.sampleCount = String(parsed.n);
output.durationsMs = JSON.stringify(parsed.durations_ms || []);

if (!parsed.ok) {
  throw new Error(
    `p95 ${parsed.p95_ms}ms exceeds SLO ${parsed.slo_ms}ms over n=${parsed.n} samples`
  );
}

// Guard: never accept a single-sample "p95"
if (!parsed.n || parsed.n < 5) {
  throw new Error(`p95 requires >=5 iterations, got n=${parsed.n}`);
}
