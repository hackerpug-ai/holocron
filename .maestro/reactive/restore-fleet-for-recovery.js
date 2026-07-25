// Maestro GraalJS helper — restore fleet via local HTTP restore-server.
// Env: RESTORE_SERVER_URL (default http://127.0.0.1:8766)

const base =
  typeof RESTORE_SERVER_URL !== 'undefined' && RESTORE_SERVER_URL
    ? RESTORE_SERVER_URL
    : 'http://127.0.0.1:8766';

const url = `${base}/restore`;
const res = http.get(url);
output.restoreUrl = url;
output.restoreStatus = res.status;
output.restoreBody = res.body;
if (res.status !== 200) {
  throw new Error(`fleet restore failed status=${res.status} body=${res.body} url=${url}`);
}
