// Advances a seeded research_sessions row via the local advance-server
// (simulates Sprint 17 engine Postgres writes for Zero WAL replay).
//
// Env:
//   TARGET_ITERATION — current_iteration to set (default 3)
//   MAX_ITERATIONS   — max_iterations (default 5)
//   ADVANCE_SERVER_URL — base URL (default http://127.0.0.1:8765)

const target = typeof TARGET_ITERATION !== 'undefined' && TARGET_ITERATION ? TARGET_ITERATION : '3';
const maxIter = typeof MAX_ITERATIONS !== 'undefined' && MAX_ITERATIONS ? MAX_ITERATIONS : '5';
const base =
  typeof ADVANCE_SERVER_URL !== 'undefined' && ADVANCE_SERVER_URL
    ? ADVANCE_SERVER_URL
    : 'http://127.0.0.1:8765';

const url = `${base}/advance/${target}/${maxIter}`;
const res = http.get(url);
output.advanceUrl = url;
output.advanceStatus = res.status;
output.advanceBody = res.body;
if (res.status !== 200) {
  throw new Error(`advance failed status=${res.status} body=${res.body} url=${url}`);
}
