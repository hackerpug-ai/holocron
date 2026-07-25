// Real MCP gateway update_document via local mcp-sync-server helper.
// The helper POSTs tools/call to PLATFORM_URL/mcp — never a mock/stub.
//
// Env:
//   ITERATION            — loop index (1..N); used for unique titles after run 1
//   TITLE                — optional explicit title override
//   DOCUMENT_ID          — seeded document uuid (default e2e doc 17)
//   MCP_SYNC_SERVER_URL  — helper base (default http://127.0.0.1:8766)
//
// Output:
//   output.expectedTitle — title the app must reflect via Zero
//   output.t0Ms          — MCP write-complete wall clock (ms)
//   output.documentId

const iteration = typeof ITERATION !== 'undefined' && ITERATION ? String(ITERATION) : '1';
const explicitTitle = typeof TITLE !== 'undefined' && TITLE ? String(TITLE) : '';
// Case 1 (AC-1) uses exact 'Updated via MCP'; later iterations need unique titles
// so each Zero reflection is observable (same title would be a false-instant pass).
const title =
  explicitTitle || (iteration === '1' ? 'Updated via MCP' : `Updated via MCP #${iteration}`);
const documentId =
  typeof DOCUMENT_ID !== 'undefined' && DOCUMENT_ID
    ? String(DOCUMENT_ID)
    : '00000000-0000-4000-8000-b00000000011';
const base =
  typeof MCP_SYNC_SERVER_URL !== 'undefined' && MCP_SYNC_SERVER_URL
    ? MCP_SYNC_SERVER_URL
    : 'http://127.0.0.1:8766';

const url =
  `${base}/update?title=${encodeURIComponent(title)}` +
  `&documentId=${encodeURIComponent(documentId)}`;
const res = http.get(url);
output.updateUrl = url;
output.updateStatus = res.status;
output.updateBody = res.body;
output.expectedTitle = title;
output.documentId = documentId;

if (res.status !== 200) {
  throw new Error(`MCP update_document failed status=${res.status} body=${res.body} url=${url}`);
}

let parsed = null;
try {
  parsed = JSON.parse(res.body);
} catch {
  throw new Error(`MCP update non-JSON body=${res.body}`);
}
if (!parsed || parsed.ok !== true) {
  throw new Error(`MCP update not ok body=${res.body}`);
}
output.t0Ms = String(parsed.t0_ms);
output.mcpTool = parsed.mcp || 'update_document';
