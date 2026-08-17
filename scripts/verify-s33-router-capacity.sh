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
    --remote-log-path) (($# > 1)) || usage; LOG_PATH=$2; shift 2 ;;
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
[[ "$LOG_PATH" =~ ^(\$\{HOME\}/|/)[A-Za-z0-9._/-]+$ ]] || die "remote log path is invalid"

resolve_evidence_paths() {
  local resolved
  if ! resolved=$(python3 - "$REPO_ROOT" "$EVIDENCE_DIR" <<'PY'
import os
import pathlib
import sys

repo, candidate_arg = sys.argv[1:]
approved = os.path.abspath(os.path.join(repo, '.tmp', 'S33-OPS-02'))
approved_real = os.path.realpath(approved)
if not os.path.isdir(approved_real):
    raise SystemExit('approved evidence root is missing or not a directory')
if approved_real != approved:
    raise SystemExit('approved evidence root is a symlink')

parts = pathlib.PurePath(candidate_arg).parts
if '..' in parts:
    raise SystemExit('candidate evidence path contains ..')
candidate = os.path.abspath(candidate_arg if os.path.isabs(candidate_arg) else os.path.join(repo, candidate_arg))
if os.path.commonpath((approved, candidate)) != approved:
    raise SystemExit('candidate evidence path is outside the approved root')

relative = os.path.relpath(candidate, approved)
current = approved
if relative != '.':
    for part in pathlib.PurePath(relative).parts:
        current = os.path.join(current, part)
        if os.path.islink(current):
            raise SystemExit('candidate evidence path contains a symlink')

candidate_real = os.path.realpath(candidate)
if os.path.commonpath((approved_real, candidate_real)) != approved_real:
    raise SystemExit('canonical candidate evidence path is outside the approved root')
print(f'{approved_real}\t{candidate_real}')
PY
  ); then
    die "evidence path rejected"
  fi
  IFS=$'\t' read -r EVIDENCE_ROOT EVIDENCE_PATH <<<"$resolved"
  [[ -n "$EVIDENCE_ROOT" && -n "$EVIDENCE_PATH" ]] || die 'evidence path resolution returned no path'
}

resolve_evidence_paths
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
  inference1-models.json inference1-models.ssh.stderr inference1-models.ssh.provenance.txt inference1-models.ssh.exit.txt reviewer-payload.json reviewer-body.json \
  reviewer-headers.txt reviewer.status.txt reviewer-body.json.curl.stderr \
  inference1-log-baseline.bytes inference2-log-baseline.bytes inference1-log-post.bytes \
  inference2-log-post.bytes inference1-log-growth.bytes inference2-log-growth.bytes \
  inference1-log-baseline.json inference2-log-baseline.json inference1-log-post.json inference2-log-post.json \
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
  printf 'host=%s\nssh_options=BatchMode=yes,StrictHostKeyChecking=yes,ConnectTimeout=%s,ConnectionAttempts=1,ServerAliveInterval=5,ServerAliveCountMax=2\ncommand=curl --silent --show-error --fail --connect-timeout 8 --max-time %s %s\n' "$host" "$SSH_TIMEOUT" "$HTTP_TIMEOUT" "$url" >"$EVIDENCE_PATH/inference1-models.ssh.provenance.txt"
  set +e
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "curl --silent --show-error --fail --connect-timeout 8 --max-time $HTTP_TIMEOUT $qurl" >"$body" 2>"$err"
  local rc=$?
  set -e
  printf '%s\n' "$rc" >"$EVIDENCE_PATH/inference1-models.ssh.exit.txt"
  if ((rc != 0)); then
    cat "$err" >> "$ERRORS_PATH"; die "SSH-originated models curl failed"
  fi
  [[ -s "$body" ]] || die "SSH-originated models response is empty"
}

remote_log_identity() {
  local host=$1 out
  out=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "p=\"$LOG_PATH\"; stat -f \"%d %i %z\" \"\$p\" 2>/dev/null || stat -c \"%d %i %s\" \"\$p\"" 2>>"$ERRORS_PATH") || die "could not read oMLX log identity from $host"
  out=$(printf '%s' "$out" | tr -d '\r\n')
  [[ "$out" =~ ^[0-9]+[[:space:]]+[0-9]+[[:space:]]+[0-9]+$ ]] || die "invalid oMLX log identity from $host"
  printf '%s\n' "$out"
}

remote_segment() {
  local host=$1 offset=$2 count=$3 destination=$4
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout="$SSH_TIMEOUT" -o ConnectionAttempts=1 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" "dd if=\"$LOG_PATH\" bs=1 skip=$offset count=$count 2>/dev/null" >"$destination" 2>>"$ERRORS_PATH" || die "could not read post-baseline log segment from $host"
}

write_log_identity() {
  local path=$1 host=$2 identity=$3 device inode size
  read -r device inode size <<<"$identity"
  printf '{"host":"%s","device":%s,"inode":%s,"byte_size":%s}\n' "$host" "$device" "$inode" "$size" >"$path"
}

wait_for_log_growth() {
  local host=$1 baseline=$2 current deadline=$((SECONDS + 30))
  local baseline_device baseline_inode baseline_size current_device current_inode current_size
  read -r baseline_device baseline_inode baseline_size <<<"$baseline"
  while :; do
    current=$(remote_log_identity "$host")
    read -r current_device current_inode current_size <<<"$current"
    [[ "$current_device" == "$baseline_device" && "$current_inode" == "$baseline_inode" ]] || die "oMLX log identity changed on $host"
    ((current_size >= baseline_size)) || die "oMLX log was truncated on $host"
    if ((current_size > baseline_size)); then
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
  python3 - "$RESULT_PATH" "$MODE" "$hb" "$hh" "$hs" "$lm" "$EVIDENCE_PATH/laptop-models.headers.txt" "$EVIDENCE_PATH/laptop-models.status.txt" "$im" "$EVIDENCE_PATH/inference1-models.ssh.provenance.txt" "$EVIDENCE_PATH/inference1-models.ssh.exit.txt" "$rb" "$rh" "$rs" "$rp" "$health_json" "$reviewer_json" <<'PY'
import json,os,sys
out,mode,health,health_headers,health_status,laptop,laptop_headers,laptop_status,mini,ssh_provenance,ssh_exit,body,headers,reviewer_status,payload,health_json,reviewer_json=sys.argv[1:]
def art(p):
    if not os.path.isfile(p) or os.path.getsize(p)<1: raise SystemExit(f'missing or empty artifact: {p}')
    return {'path':os.path.relpath(p,os.getcwd()),'exists':True,'byte_length':os.path.getsize(p)}
manifest={'health':art(health),'health_headers':art(health_headers),'health_status':art(health_status),'laptop_models':art(laptop),'laptop_models_headers':art(laptop_headers),'laptop_models_status':art(laptop_status),'inference1_models':art(mini),'inference1_ssh_provenance':art(ssh_provenance),'inference1_ssh_exit':art(ssh_exit),'reviewer_payload':art(payload),'reviewer_body':art(body),'reviewer_headers':art(headers),'reviewer_status':art(reviewer_status)}
r={'ok':True,'mode':mode,'health':json.loads(health_json),'laptop_models_artifact_path':manifest['laptop_models']['path'],'inference1_models_artifact_path':manifest['inference1_models']['path'],'laptop_models_artifact':manifest['laptop_models'],'inference1_models_artifact':manifest['inference1_models'],'laptop_models_has_both_roles':True,'inference1_models_has_both_roles':True,'reviewer_body_artifact':manifest['reviewer_body'],'reviewer_headers_artifact':manifest['reviewer_headers'],'reviewer_completion':json.loads(reviewer_json),'artifact_manifest':manifest}
if r['laptop_models_artifact_path']==r['inference1_models_artifact_path']: raise SystemExit('models artifact paths are not distinct')
json.dump(r,open(out,'w',encoding='utf-8'),indent=2,sort_keys=True); open(out,'a',encoding='utf-8').write('\n')
PY
}

distribution() {
  local rr=$EVIDENCE_PATH/requests
  local id dir baseline1 baseline2 post1 post2 growth1 growth2 failed=0 pid
  mkdir -p "$rr"
  baseline1=$(remote_log_identity "$INFERENCE1_HOST"); baseline2=$(remote_log_identity "$INFERENCE2_HOST")
  read -r _baseline1_device _baseline1_inode _baseline1_size <<<"$baseline1"
  read -r _baseline2_device _baseline2_inode _baseline2_size <<<"$baseline2"
  printf '%s\n' "$_baseline1_size" >"$EVIDENCE_PATH/inference1-log-baseline.bytes"
  printf '%s\n' "$_baseline2_size" >"$EVIDENCE_PATH/inference2-log-baseline.bytes"
  write_log_identity "$EVIDENCE_PATH/inference1-log-baseline.json" "$INFERENCE1_HOST" "$baseline1"
  write_log_identity "$EVIDENCE_PATH/inference2-log-baseline.json" "$INFERENCE2_HOST" "$baseline2"
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
  read -r _post1_device _post1_inode _post1_size <<<"$post1"
  read -r _post2_device _post2_inode _post2_size <<<"$post2"
  printf '%s\n' "$_post1_size" >"$EVIDENCE_PATH/inference1-log-post.bytes"; printf '%s\n' "$_post2_size" >"$EVIDENCE_PATH/inference2-log-post.bytes"
  write_log_identity "$EVIDENCE_PATH/inference1-log-post.json" "$INFERENCE1_HOST" "$post1"
  write_log_identity "$EVIDENCE_PATH/inference2-log-post.json" "$INFERENCE2_HOST" "$post2"
  growth1=$((_post1_size-_baseline1_size)); growth2=$((_post2_size-_baseline2_size))
  ((growth1>0 && growth2>0)) || die "one mini log has no post-baseline growth"
  printf '%s\n' "$growth1" >"$EVIDENCE_PATH/inference1-log-growth.bytes"; printf '%s\n' "$growth2" >"$EVIDENCE_PATH/inference2-log-growth.bytes"
  remote_segment "$INFERENCE1_HOST" "$_baseline1_size" "$growth1" "$EVIDENCE_PATH/inference1-log-post-baseline.log"
  remote_segment "$INFERENCE2_HOST" "$_baseline2_size" "$growth2" "$EVIDENCE_PATH/inference2-log-post-baseline.log"
  [[ -s "$EVIDENCE_PATH/inference1-log-post-baseline.log" && -s "$EVIDENCE_PATH/inference2-log-post-baseline.log" ]] || die "post-baseline log segment empty"
  local fresh1 fresh2
  fresh1=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference1-log-post-baseline.log" || true)
  fresh2=$(grep -Ec 'Chat completion: model=Qwen3\.6-35B-A3B-MLX-8bit' "$EVIDENCE_PATH/inference2-log-post-baseline.log" || true)
  [[ "$fresh1" =~ ^[1-9][0-9]*$ ]] || die "inference1 fresh completion evidence missing"
  [[ "$fresh2" =~ ^[1-9][0-9]*$ ]] || die "inference2 fresh completion evidence missing"
  python3 - "$RESULT_PATH" "$MODE" "$EVIDENCE_PATH/request-summaries.jsonl" "$EVIDENCE_PATH/inference1-log-post-baseline.log" "$EVIDENCE_PATH/inference2-log-post-baseline.log" "$EVIDENCE_PATH/inference1-log-baseline.json" "$EVIDENCE_PATH/inference2-log-baseline.json" "$EVIDENCE_PATH/inference1-log-post.json" "$EVIDENCE_PATH/inference2-log-post.json" "$rr" "$REQUEST_COUNT" "$fresh1" "$fresh2" <<'PY'
import json,os,sys
out,mode,summaries,log1,log2,baseline1,baseline2,post1,post2,requests_dir,count,fresh1,fresh2=sys.argv[1:]
rows=[json.loads(x) for x in open(summaries) if x.strip()]
if len(rows)!=int(count): raise SystemExit(f'expected {count} request summaries, found {len(rows)}')
hosts={r['api_base'] for r in rows}
expected={'http://inference1.tail011a51.ts.net:8003/v1','http://inference2.tail011a51.ts.net:8003/v1'}
if hosts!=expected: raise SystemExit(f'expected both exact backend headers, got {sorted(hosts)}')
bodies={r['body_sha256'] for r in rows if r['body_bytes']>0}
if len(bodies)<2: raise SystemExit('expected >=2 byte-distinct nonempty bodies')
def art(p): return {'path':os.path.relpath(p,os.getcwd()),'exists':os.path.isfile(p),'byte_length':os.path.getsize(p) if os.path.isfile(p) else 0}
def required_artifact(path):
    if not os.path.isfile(path) or os.path.getsize(path)<1: raise SystemExit(f'missing or empty artifact: {path}')
    return art(path)
request_artifacts=[]
request_dirs=sorted(os.path.join(requests_dir,name) for name in os.listdir(requests_dir) if name.startswith('request-') and os.path.isdir(os.path.join(requests_dir,name)))
if len(request_dirs)!=int(count): raise SystemExit(f'expected {count} raw request directories, found {len(request_dirs)}')
for request_dir in request_dirs:
    request_artifacts.append({'path':os.path.relpath(request_dir,os.getcwd()),'artifacts':{name:required_artifact(os.path.join(request_dir,name)) for name in ('metadata.json','pid','status.txt','headers.txt','body.json','curl-exit.txt')}})
manifest={'request_summaries':required_artifact(summaries),'inference1_log_baseline_identity':required_artifact(baseline1),'inference2_log_baseline_identity':required_artifact(baseline2),'inference1_log_post_identity':required_artifact(post1),'inference2_log_post_identity':required_artifact(post2),'inference1_log_post_baseline':required_artifact(log1),'inference2_log_post_baseline':required_artifact(log2)}
r={'ok':True,'mode':mode,'request_count':int(count),'tracked_request_count':len(rows),'backend_headers':sorted(hosts),'distinct_nonempty_body_count':len(bodies),'requests_artifact_path':os.path.relpath(os.path.dirname(summaries),os.getcwd()),'request_summaries_artifact':manifest['request_summaries'],'request_artifacts':request_artifacts,'inference1_log_baseline_identity_artifact':manifest['inference1_log_baseline_identity'],'inference2_log_baseline_identity_artifact':manifest['inference2_log_baseline_identity'],'inference1_log_post_identity_artifact':manifest['inference1_log_post_identity'],'inference2_log_post_identity_artifact':manifest['inference2_log_post_identity'],'inference1_log_post_baseline_artifact':manifest['inference1_log_post_baseline'],'inference2_log_post_baseline_artifact':manifest['inference2_log_post_baseline'],'inference1_fresh_request_count':int(fresh1),'inference2_fresh_request_count':int(fresh2),'inference1_fresh_log_evidence':int(fresh1)>=1,'inference2_fresh_log_evidence':int(fresh2)>=1,'artifact_manifest':manifest}
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
