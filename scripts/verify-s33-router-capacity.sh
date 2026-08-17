#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
MODE=
ROUTER_URL=http://holocron.tail011a51.ts.net:4545
HEALTH_URL=https://holocron.tail011a51.ts.net:44111/health
INFERENCE1_HOST=
INFERENCE2_HOST=
REQUEST_COUNT=6
EVIDENCE_DIR=.tmp/S33-OPS-02
HTTP_TIMEOUT=180
SSH_TIMEOUT=12
EXPECTED_REVIEWER_BASE=http://inference2.tail011a51.ts.net:8003/v1
EXPECTED_INFERENCE1_BASE=http://inference1.tail011a51.ts.net:8003/v1
EXPECTED_INFERENCE2_BASE=http://inference2.tail011a51.ts.net:8003/v1
LOG_PATH='${HOME}/local-llm/logs/omlx-mini-8003.log'

die() { echo "S33-OPS-02 verifier failed: $*" >&2; exit 1; }
usage() { echo "usage: $0 --mode models-reviewer|implementer-distribution [options]" >&2; exit 2; }

while (($#)); do
  case "$1" in
    --mode) (($# > 1)) || usage; MODE=$2; shift 2 ;;
    --router-url) (($# > 1)) || usage; ROUTER_URL=$2; shift 2 ;;
    --health-url) (($# > 1)) || usage; HEALTH_URL=$2; shift 2 ;;
    --inference1-host) (($# > 1)) || usage; INFERENCE1_HOST=$2; shift 2 ;;
    --inference2-host) (($# > 1)) || usage; INFERENCE2_HOST=$2; shift 2 ;;
    --request-count) (($# > 1)) || usage; REQUEST_COUNT=$2; shift 2 ;;
    --evidence-dir) (($# > 1)) || usage; EVIDENCE_DIR=$2; shift 2 ;;
    --help|-h) usage ;;
    *) usage ;;
  esac
done

case "$MODE" in
  models-reviewer) [[ -n "$INFERENCE1_HOST" ]] || die "--inference1-host is required" ;;
  implementer-distribution)
    [[ -n "$INFERENCE1_HOST" && -n "$INFERENCE2_HOST" ]] || die "both mini hosts are required"
    [[ "$REQUEST_COUNT" =~ ^[1-9][0-9]*$ && "$REQUEST_COUNT" -ge 2 ]] || die "--request-count must be >= 2"
    ;;
  *) die "unsupported mode" ;;
esac
[[ "$ROUTER_URL" =~ ^https?://[^[:space:]]+$ ]] || die "router URL must be an http(s) URL without whitespace"
[[ "$HEALTH_URL" =~ ^https?://[^[:space:]]+$ ]] || die "health URL must be an http(s) URL without whitespace"
[[ -z "$INFERENCE1_HOST" || "$INFERENCE1_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die "inference1 host is invalid"
[[ -z "$INFERENCE2_HOST" || "$INFERENCE2_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die "inference2 host is invalid"

if [[ "$EVIDENCE_DIR" = /* ]]; then EVIDENCE_PATH=$EVIDENCE_DIR; else EVIDENCE_PATH=$REPO_ROOT/$EVIDENCE_DIR; fi
case "$EVIDENCE_PATH" in
  "$REPO_ROOT/.tmp/S33-OPS-02"|"$REPO_ROOT/.tmp/S33-OPS-02"/*) ;;
  *) die "evidence path must be below .tmp/S33-OPS-02" ;;
esac
mkdir -p -- "$EVIDENCE_PATH"
ERRORS_PATH=$EVIDENCE_PATH/errors.log
: > "$ERRORS_PATH"
RESULT_PATH=$EVIDENCE_PATH/result.json
ROUTER_BASE=$(printf '%s' "$ROUTER_URL" | sed 's:/*$::')

# Preserve other S33 evidence.  A mode owns only these paths and its request
# subtree; never erase the task evidence root or another mode's artifacts.
for owned in \
  result.json health.json health.headers.txt health.status.txt health.json.curl.stderr \
  laptop-models.json laptop-models.headers.txt laptop-models.status.txt laptop-models.json.curl.stderr \
  inference1-models.json inference1-models.ssh.stderr reviewer-payload.json reviewer-body.json \
  reviewer-headers.txt reviewer.status.txt reviewer-body.json.curl.stderr \
  inference1-log-baseline.bytes inference2-log-baseline.bytes inference1-log-post.bytes \
  inference2-log-post.bytes inference1-log-growth.bytes inference2-log-growth.bytes \
  inference1-log-post-baseline.log inference2-log-post-baseline.log request-summaries.jsonl; do
  rm -f -- "$EVIDENCE_PATH/$owned"
done
rm -rf -- "$EVIDENCE_PATH/requests"

relative_path() {
  printf '%s\n' "$1" | sed "s#^$REPO_ROOT#.#"
}

local_http() {
  local method=$1 url=$2 body=$3 headers=$4 status_file=$5 payload=$6
  local status rc
  set +e
  if [[ -n "$payload" ]]; then
    status=$(curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --request "$method" --header 'content-type: application/json' --data-binary "@$payload" --dump-header "$headers" --output "$body" --write-out '%{http_code}' "$url" 2>"$body.curl.stderr")
  else
    status=$(curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --request "$method" --dump-header "$headers" --output "$body" --write-out '%{http_code}' "$url" 2>"$body.curl.stderr")
  fi
  rc=$?
  set -e
  printf '%s' "$status" >"$status_file"
  ((rc == 0)) || { cat "$body.curl.stderr" >> "$ERRORS_PATH"; die "curl failed for $url"; }
  [[ "$status" =~ ^2[0-9][0-9]$ ]] || die "HTTP $status from $url"
}

remote_models() {
  local host=$1 url=$2 body=$3 err=$4 qurl
  printf -v qurl '%q' "$url"
  if ! ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "curl --silent --show-error --fail --connect-timeout 8 --max-time $HTTP_TIMEOUT $qurl" >"$body" 2>"$err"; then
    cat "$err" >> "$ERRORS_PATH"; die "SSH-originated models curl failed"
  fi
  [[ -s "$body" ]] || die "SSH-originated models response is empty"
}

remote_log_size() {
  local host=$1 out
  out=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" 'p="$HOME/local-llm/logs/omlx-mini-8003.log"; stat -f "%z" "$p" 2>/dev/null || stat -c "%s" "$p"' 2>>"$ERRORS_PATH") || die "could not read oMLX log size from $host"
  out=$(printf '%s' "$out" | tr -d '\r\n')
  [[ "$out" =~ ^[0-9]+$ ]] || die "non-numeric oMLX log size from $host"
  printf '%s\n' "$out"
}

remote_segment() {
  local host=$1 offset=$2 count=$3 destination=$4
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "dd if=\"$LOG_PATH\" bs=1 skip=$offset count=$count 2>/dev/null" >"$destination" 2>>"$ERRORS_PATH" || die "could not read post-baseline log segment from $host"
}

wait_for_log_growth() {
  local host=$1 baseline=$2 current deadline=$((SECONDS + 30))
  while :; do
    current=$(remote_log_size "$host")
    ((current >= baseline)) || die "oMLX log shrank or rotated on $host"
    if ((current > baseline)); then
      printf '%s\n' "$current"
      return 0
    fi
    if ((SECONDS >= deadline)); then
      die "oMLX log did not grow after tracked requests on $host"
    fi
    sleep 1
  done
}

assert_models() {
  python3 - "$1" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception as e: raise SystemExit(f'invalid models JSON: {e}')
ids=[x.get('id') for x in d.get('data',[]) if isinstance(x,dict)]
if 'implementer' not in ids or 'reviewer' not in ids: raise SystemExit(f'missing exact roles: {ids!r}')
print('true')
PY
}

assert_health() {
  python3 - "$1" <<'PY'
import json,sys
try: d=json.load(open(sys.argv[1],encoding='utf-8'))
except Exception as e: raise SystemExit(f'invalid health JSON: {e}')
if d.get('status')!='ok': raise SystemExit(f'health status={d.get("status")!r}')
f=d.get('fleet')
if not isinstance(f,dict) or f.get('ready') is not True: raise SystemExit(f'fleet not ready: {f!r}')
if d.get('failing_dependency') is not None: raise SystemExit(f'failure dependency={d.get("failing_dependency")!r}')
if not isinstance(f.get('latency_ms'),(int,float)) or f['latency_ms']<1: raise SystemExit(f'invalid fleet latency: {f.get("latency_ms")!r}')
print(json.dumps({'status':'ok','fleet_ready':True,'latency_ms':f['latency_ms']}))
PY
}

assert_reviewer() {
  python3 - "$1" "$2" "$3" "$EXPECTED_REVIEWER_BASE" <<'PY'
import json,sys
body,headers,status,expected=sys.argv[1:]
s=open(status).read().strip()
if not s.isdigit() or not 200<=int(s)<300: raise SystemExit(f'bad reviewer HTTP status {s!r}')
try: d=json.load(open(body,encoding='utf-8'))
except Exception as e: raise SystemExit(f'bad reviewer JSON: {e}')
try: content=d['choices'][0]['message']['content']
except (KeyError,IndexError,TypeError) as e: raise SystemExit(f'missing reviewer content: {e}')
if not isinstance(content,str) or not content.strip(): raise SystemExit('empty reviewer content')
base=None
for line in open(headers,encoding='utf-8',errors='replace'):
    k,sep,v=line.partition(':')
    if sep and k.strip().lower()=='x-litellm-model-api-base': base=v.strip()
if base!=expected or 'inference1.tail011a51.ts.net' in base: raise SystemExit(f'wrong reviewer backend: {base!r}')
print(json.dumps({'http_status':int(s),'content_nonempty':True,'api_base':base}))
PY
}

make_payload() {
  python3 - "$1" "$2" <<'PY'
import json,sys
p={'model':'implementer','messages':[{'role':'user','content':f'S33-OPS-02 live capacity request {sys.argv[2]}: reply with a short unique sentence.'}],'max_tokens':96,'temperature':0.7}
with open(sys.argv[1],'w',encoding='utf-8') as h: json.dump(p,h,separators=(',',':')); h.write('\n')
PY
}

request_one() {
  local dir=$1 url=$2
  set +e
  curl --silent --show-error --connect-timeout 8 --max-time "$HTTP_TIMEOUT" --retry 0 --header 'content-type: application/json' --data-binary "@$dir/payload.json" --dump-header "$dir/headers.txt" --output "$dir/body.json" --write-out '%{http_code}' "$url" >"$dir/status.txt" 2>"$dir/curl.stderr"
  local rc=$?
  set -e
  printf '%s\n' "$rc" >"$dir/curl-exit.txt"
  return "$rc"
}

assert_request() {
  python3 - "$1" "$EXPECTED_INFERENCE1_BASE" "$EXPECTED_INFERENCE2_BASE" <<'PY'
import hashlib,json,sys,os
d,e1,e2=sys.argv[1:]
metadata=json.load(open(f'{d}/metadata.json',encoding='utf-8'))
if not isinstance(metadata.get('pid'),int) or metadata['pid']<=0: raise SystemExit('request metadata has no valid tracked PID')
status=open(f'{d}/status.txt').read().strip(); rc=open(f'{d}/curl-exit.txt').read().strip()
if rc!='0': raise SystemExit(f'curl exit={rc!r}')
if not status.isdigit() or not 200<=int(status)<300: raise SystemExit(f'bad HTTP status={status!r}')
b=open(f'{d}/body.json','rb').read()
if not b: raise SystemExit('empty response body')
try: x=json.loads(b)
except Exception as e: raise SystemExit(f'bad response JSON: {e}')
try: content=x['choices'][0]['message']['content']
except (KeyError,IndexError,TypeError) as e: raise SystemExit(f'missing generated content: {e}')
if not isinstance(content,str) or not content.strip(): raise SystemExit('empty generated content')
base=None
for line in open(f'{d}/headers.txt',encoding='utf-8',errors='replace'):
    k,sep,v=line.partition(':')
    if sep and k.strip().lower()=='x-litellm-model-api-base': base=v.strip()
if base not in {e1,e2}: raise SystemExit(f'wrong backend header={base!r}')
print(json.dumps({'request_dir':os.path.relpath(d,os.getcwd()),'request_id':metadata['request_id'],'pid':metadata['pid'],'http_status':int(status),'api_base':base,'body_bytes':len(b),'body_sha256':hashlib.sha256(b).hexdigest(),'content_nonempty':True}))
PY
}

models_reviewer() {
  local hb=$EVIDENCE_PATH/health.json hh=$EVIDENCE_PATH/health.headers.txt hs=$EVIDENCE_PATH/health.status.txt
  local lm=$EVIDENCE_PATH/laptop-models.json im=$EVIDENCE_PATH/inference1-models.json
  local rp=$EVIDENCE_PATH/reviewer-payload.json rb=$EVIDENCE_PATH/reviewer-body.json rh=$EVIDENCE_PATH/reviewer-headers.txt rs=$EVIDENCE_PATH/reviewer.status.txt
  local health_json reviewer_json
  local_http GET "$HEALTH_URL" "$hb" "$hh" "$hs" ""
  health_json=$(assert_health "$hb")
  local_http GET "$ROUTER_BASE/v1/models" "$lm" "$EVIDENCE_PATH/laptop-models.headers.txt" "$EVIDENCE_PATH/laptop-models.status.txt" ""
  [[ "$(assert_models "$lm")" == true ]] || die "laptop role assertion failed"
  remote_models "$INFERENCE1_HOST" "$ROUTER_BASE/v1/models" "$im" "$EVIDENCE_PATH/inference1-models.ssh.stderr"
  [[ "$(assert_models "$im")" == true ]] || die "inference1 role assertion failed"
  python3 - "$rp" <<'PY'
import json,sys
with open(sys.argv[1],'w',encoding='utf-8') as h:
    json.dump({'model':'reviewer','messages':[{'role':'user','content':'S33-OPS-02 live reviewer check: reply with a short sentence.'}],'max_tokens':96,'temperature':0},h,separators=(',',':')); h.write('\n')
PY
  local_http POST "$ROUTER_BASE/v1/chat/completions" "$rb" "$rh" "$rs" "$rp"
  reviewer_json=$(assert_reviewer "$rb" "$rh" "$rs")
  python3 - "$RESULT_PATH" "$MODE" "$hb" "$hh" "$hs" "$lm" "$EVIDENCE_PATH/laptop-models.headers.txt" "$EVIDENCE_PATH/laptop-models.status.txt" "$im" "$rb" "$rh" "$rp" "$health_json" "$reviewer_json" <<'PY'
import json,os,sys
out,mode,health,health_headers,health_status,laptop,laptop_headers,laptop_status,mini,body,headers,payload,health_json,reviewer_json=sys.argv[1:]
def art(p):
    if not os.path.isfile(p) or os.path.getsize(p)<1: raise SystemExit(f'missing or empty artifact: {p}')
    return {'path':os.path.relpath(p,os.getcwd()),'exists':True,'byte_length':os.path.getsize(p)}
manifest={'health':art(health),'health_headers':art(health_headers),'health_status':art(health_status),'laptop_models':art(laptop),'laptop_models_headers':art(laptop_headers),'laptop_models_status':art(laptop_status),'inference1_models':art(mini),'reviewer_payload':art(payload),'reviewer_body':art(body),'reviewer_headers':art(headers)}
r={'ok':True,'mode':mode,'health':json.loads(health_json),'laptop_models_artifact_path':manifest['laptop_models']['path'],'inference1_models_artifact_path':manifest['inference1_models']['path'],'laptop_models_artifact':manifest['laptop_models'],'inference1_models_artifact':manifest['inference1_models'],'laptop_models_has_both_roles':True,'inference1_models_has_both_roles':True,'reviewer_body_artifact':manifest['reviewer_body'],'reviewer_headers_artifact':manifest['reviewer_headers'],'reviewer_completion':json.loads(reviewer_json),'artifact_manifest':manifest}
if r['laptop_models_artifact_path']==r['inference1_models_artifact_path']: raise SystemExit('models artifact paths are not distinct')
json.dump(r,open(out,'w',encoding='utf-8'),indent=2,sort_keys=True); open(out,'a',encoding='utf-8').write('\n')
PY
}

distribution() {
  local rr=$EVIDENCE_PATH/requests
  local id dir baseline1 baseline2 post1 post2 growth1 growth2 failed=0 pid
  mkdir -p "$rr"
  baseline1=$(remote_log_size "$INFERENCE1_HOST"); baseline2=$(remote_log_size "$INFERENCE2_HOST")
  printf '%s\n' "$baseline1" >"$EVIDENCE_PATH/inference1-log-baseline.bytes"
  printf '%s\n' "$baseline2" >"$EVIDENCE_PATH/inference2-log-baseline.bytes"
  for ((id=1;id<=REQUEST_COUNT;id++)); do
    dir=$rr/request-$id; mkdir -p "$dir"; make_payload "$dir/payload.json" "$id"
    request_one "$dir" "$ROUTER_BASE/v1/chat/completions" &
    pid=$!
    printf '%s\n' "$pid" >"$dir/pid"
    printf '{"request_id":%s,"pid":%s,"prompt_artifact_path":"%s"}\n' "$id" "$pid" "$(relative_path "$dir/payload.json")" >"$dir/metadata.json"
  done
  for ((id=1;id<=REQUEST_COUNT;id++)); do pid=$(cat "$rr/request-$id/pid"); wait "$pid" || failed=1; done
  ((failed==0)) || die "tracked concurrent request failed"
  : >"$EVIDENCE_PATH/request-summaries.jsonl"
  for ((id=1;id<=REQUEST_COUNT;id++)); do assert_request "$rr/request-$id" >>"$EVIDENCE_PATH/request-summaries.jsonl"; done
  post1=$(wait_for_log_growth "$INFERENCE1_HOST" "$baseline1"); post2=$(wait_for_log_growth "$INFERENCE2_HOST" "$baseline2")
  printf '%s\n' "$post1" >"$EVIDENCE_PATH/inference1-log-post.bytes"; printf '%s\n' "$post2" >"$EVIDENCE_PATH/inference2-log-post.bytes"
  growth1=$((post1-baseline1)); growth2=$((post2-baseline2))
  ((growth1>0 && growth2>0)) || die "one mini log has no post-baseline growth"
  printf '%s\n' "$growth1" >"$EVIDENCE_PATH/inference1-log-growth.bytes"; printf '%s\n' "$growth2" >"$EVIDENCE_PATH/inference2-log-growth.bytes"
  remote_segment "$INFERENCE1_HOST" "$baseline1" "$growth1" "$EVIDENCE_PATH/inference1-log-post-baseline.log"
  remote_segment "$INFERENCE2_HOST" "$baseline2" "$growth2" "$EVIDENCE_PATH/inference2-log-post-baseline.log"
  [[ -s "$EVIDENCE_PATH/inference1-log-post-baseline.log" && -s "$EVIDENCE_PATH/inference2-log-post-baseline.log" ]] || die "post-baseline log segment empty"
  local fresh1 fresh2
  fresh1=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference1-log-post-baseline.log" || true)
  fresh2=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference2-log-post-baseline.log" || true)
  [[ "$fresh1" =~ ^[1-9][0-9]*$ ]] || die "inference1 fresh completion evidence missing"
  [[ "$fresh2" =~ ^[1-9][0-9]*$ ]] || die "inference2 fresh completion evidence missing"
  python3 - "$RESULT_PATH" "$MODE" "$EVIDENCE_PATH/request-summaries.jsonl" "$EVIDENCE_PATH/inference1-log-post-baseline.log" "$EVIDENCE_PATH/inference2-log-post-baseline.log" "$REQUEST_COUNT" "$fresh1" "$fresh2" <<'PY'
import json,os,sys
out,mode,summaries,log1,log2,count,fresh1,fresh2=sys.argv[1:]
rows=[json.loads(x) for x in open(summaries) if x.strip()]
if len(rows)!=int(count): raise SystemExit(f'expected {count} request summaries, found {len(rows)}')
hosts={r['api_base'] for r in rows}
expected={'http://inference1.tail011a51.ts.net:8003/v1','http://inference2.tail011a51.ts.net:8003/v1'}
if hosts!=expected: raise SystemExit(f'expected both exact backend headers, got {sorted(hosts)}')
bodies={r['body_sha256'] for r in rows if r['body_bytes']>0}
if len(bodies)<2: raise SystemExit('expected >=2 byte-distinct nonempty bodies')
def art(p): return {'path':os.path.relpath(p,os.getcwd()),'exists':os.path.isfile(p),'byte_length':os.path.getsize(p) if os.path.isfile(p) else 0}
r={'ok':True,'mode':mode,'request_count':int(count),'tracked_request_count':len(rows),'backend_headers':sorted(hosts),'distinct_nonempty_body_count':len(bodies),'requests_artifact_path':os.path.relpath(os.path.dirname(summaries),os.getcwd()),'request_summaries_artifact':art(summaries),'inference1_log_post_baseline_artifact':art(log1),'inference2_log_post_baseline_artifact':art(log2),'inference1_fresh_request_count':int(fresh1),'inference2_fresh_request_count':int(fresh2),'inference1_fresh_log_evidence':int(fresh1)>=1,'inference2_fresh_log_evidence':int(fresh2)>=1}
json.dump(r,open(out,'w',encoding='utf-8'),indent=2,sort_keys=True); open(out,'a',encoding='utf-8').write('\n')
PY
}

case "$MODE" in models-reviewer) models_reviewer ;; implementer-distribution) distribution ;; esac
[[ -s "$RESULT_PATH" ]] || die "result.json missing"
python3 - "$RESULT_PATH" <<'PY'
import json,sys
r=json.load(open(sys.argv[1],encoding='utf-8'))
if r.get('ok') is not True: raise SystemExit('result does not assert ok:true')
print(json.dumps(r,sort_keys=True))
PY
