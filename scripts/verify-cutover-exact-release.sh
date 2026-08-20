#!/usr/bin/env bash
# CUTOVER-RELEASE-001 verifier — real Git/OCI/Compose/Docker observations only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${PLATFORM_IT:-}" != "1" ]]; then
  printf '{"ok":false,"error":"PLATFORM_IT=1 is required"}\n'
  exit 2
fi

CASE=""
JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --case) CASE="${2:-}"; shift 2 ;;
    --json) JSON=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage:
  PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deterministic-package --json
  PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deployed-identity --json
  PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case postgres-preserving-release-rollback --json
EOF
      exit 0
      ;;
    *)
      printf '{"ok":false,"error":"unknown argument: %s"}\n' "$1"
      exit 2
      ;;
  esac
done

if [[ -z "$CASE" ]]; then
  printf '{"ok":false,"error":"--case is required"}\n'
  exit 2
fi

RUN_ID="${CUTOVER_RELEASE_RUN_ID:-$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 3)}"
EVIDENCE="$ROOT/.tmp/CUTOVER-RELEASE-001/${RUN_ID}"
mkdir -p "$EVIDENCE"

STAGE_SCRIPT="$ROOT/scripts/stage-holocron-release.sh"
DEPLOY_HOST="${HOLO_DEPLOY_TARGET:-holocron}"
BASE_URL="${HOLO_PRODUCTION_BASE_URL:-https://holocron.tail011a51.ts.net:44111}"
COMPOSE_FILE="$ROOT/services/platform/deploy/compose/compose.yaml"
PGBACKREST_CONF="$ROOT/services/platform/deploy/compose/pgbackrest.conf"
REGISTRY="${HOLO_OCI_REGISTRY:-localhost:5000}"
PREVIOUS_IMAGE="${HOLO_PREVIOUS_PLATFORM_IMAGE:-localhost:5000/holocron-platform@sha256:e20d53470c936831bf2ed9e7b4bf6a1a509baab5fcd89eb6d7ec0c6fece23a4f}"
PRIOR_RELEASE="${HOLO_PRIOR_VERIFIED_RELEASE_PATH:-$HOME/Projects/holocron/.tmp/S33-PLAT-05/final-0c469717d5f0acc680ffae0eb254dbcae7023628/image-lock.json}"

fail_json() {
  local msg="$1"
  if [[ "$JSON" -eq 1 ]]; then
    printf '{"ok":false,"case":"%s","error":%s,"evidenceDir":"%s"}\n' \
      "$CASE" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$msg")" "$EVIDENCE"
  else
    echo "error: $msg" >&2
  fi
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail_json "missing required file: $1"
}

ssh_holocron() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$DEPLOY_HOST" "export PATH=/usr/local/bin:/Users/holocron/.bun/bin:\$PATH; $*"
}

case "$CASE" in
  deterministic-package)
    require_file "$STAGE_SCRIPT"
    require_file "$COMPOSE_FILE"
    require_file "$PGBACKREST_CONF"

    SOURCE_REVISION="$(git rev-parse HEAD)"
    [[ "$SOURCE_REVISION" =~ ^[a-f0-9]{40}$ ]] || fail_json "HEAD is not a 40-hex revision"

    OUT_A="$EVIDENCE/stage-a"
    OUT_B="$EVIDENCE/stage-b"
    mkdir -p "$OUT_A" "$OUT_B"

    HOLO_OCI_REGISTRY="$REGISTRY" HOLO_PREVIOUS_PLATFORM_IMAGE="$PREVIOUS_IMAGE" \
      bash "$STAGE_SCRIPT" --source-revision "$SOURCE_REVISION" --out "$OUT_A" --json \
      >"$EVIDENCE/stage-a.stdout.json"
    HOLO_OCI_REGISTRY="$REGISTRY" HOLO_PREVIOUS_PLATFORM_IMAGE="$PREVIOUS_IMAGE" \
      bash "$STAGE_SCRIPT" --source-revision "$SOURCE_REVISION" --out "$OUT_B" --json \
      >"$EVIDENCE/stage-b.stdout.json"

    require_file "$OUT_A/release-manifest.json"
    require_file "$OUT_B/release-manifest.json"
    SHA_A="$(shasum -a 256 "$OUT_A/release-manifest.json" | awk '{print $1}')"
    SHA_B="$(shasum -a 256 "$OUT_B/release-manifest.json" | awk '{print $1}')"
    [[ "$SHA_A" == "$SHA_B" ]] || fail_json "release manifests are not byte-identical across two clean stages"

    python3 - "$OUT_A/release-manifest.json" "$PGBACKREST_CONF" "$EVIDENCE" "$SHA_A" "$DEPLOY_HOST" <<'PY' || exit 1
import json, subprocess, sys, pathlib
manifest_path, conf_path, evidence, manifest_sha, deploy_host = sys.argv[1:6]
manifest = json.loads(pathlib.Path(manifest_path).read_text())
errors=[]
src=manifest.get("sourceRevision") or ""
if not (isinstance(src,str) and len(src)==40):
  errors.append("sourceRevision length != 40")
digests=manifest.get("imageDigests") or {}
if not isinstance(digests, dict) or len(digests) < 2:
  errors.append("imageDigestCount < 2")
for k,v in digests.items():
  if not (isinstance(v,str) and v.startswith("sha256:") and len(v)==71):
    errors.append(f"empty/invalid imageDigest:{k}")
compose=manifest.get("composeSha256") or ""
if not (isinstance(compose,str) and len(compose)==64):
  errors.append("composeSha256 length != 64")
images=manifest.get("images") or {}
blob=json.dumps(manifest)
if ":latest@" in blob or blob.endswith(":latest") or "/latest@" in blob:
  errors.append("latest tag present")
backup=manifest.get("backupRunner") or {}
if not backup.get("pgbackrestConfPath"):
  errors.append("missing pgBackRest config")
conf=pathlib.Path(conf_path)
if not conf.exists():
  errors.append("missing pgBackRest config file")
pg_img=backup.get("pgbackrestImage") or images.get("pgbackrest")
restic_img=backup.get("resticImage") or images.get("restic")
platform_img=images.get("platform")

def local_docker_ok():
  return subprocess.run(["docker","info"], capture_output=True).returncode == 0

def run_docker(args):
  if local_docker_ok():
    return subprocess.run(["docker", *args], capture_output=True, text=True)
  # Prefer production host docker when the laptop socket is unavailable.
  remote = "export PATH=/usr/local/bin:$PATH; " + subprocess.list2cmdline(["docker", *args])
  cmd = ["ssh","-o","BatchMode=yes",deploy_host, remote]
  return subprocess.run(cmd, capture_output=True, text=True)

pg = run_docker(["run","--rm","--entrypoint","pgbackrest", pg_img, "version"]) if pg_img else None
rs = run_docker(["run","--rm","--entrypoint","restic", restic_img, "version"]) if restic_img else None
plat_pg=plat_rs=None
if platform_img:
  plat_pg=run_docker(["run","--rm","--entrypoint","/usr/local/bin/pgbackrest", platform_img, "version"])
  plat_rs=run_docker(["run","--rm","--entrypoint","/usr/local/bin/restic", platform_img, "version"])
pg_code = (plat_pg.returncode if plat_pg and plat_pg.returncode==0 else (pg.returncode if pg else 1))
rs_code = (plat_rs.returncode if plat_rs and plat_rs.returncode==0 else (rs.returncode if rs else 1))
out={
  "ok": len(errors)==0 and pg_code==0 and rs_code==0,
  "case":"deterministic-package",
  "sourceRevision": src,
  "sourceRevisionLength": len(src),
  "imageDigestCount": len(digests) if isinstance(digests,dict) else 0,
  "composeSha256": compose,
  "composeSha256Length": len(compose),
  "releaseManifestSha256": manifest_sha,
  "pgBackRestExitCode": pg_code,
  "resticExitCode": rs_code,
  "errors": errors,
}
pathlib.Path(evidence,"deterministic-package.json").write_text(json.dumps(out, indent=2)+"\n")
print(json.dumps(out))
sys.exit(0 if out["ok"] else 1)
PY
    ;;

  deployed-identity)
    require_file "$STAGE_SCRIPT"
    require_file "$COMPOSE_FILE"
    SOURCE_REVISION="$(git rev-parse HEAD)"
    STAGE_OUT="$EVIDENCE/deploy-stage"
    mkdir -p "$STAGE_OUT"
    HOLO_OCI_REGISTRY="$REGISTRY" HOLO_PREVIOUS_PLATFORM_IMAGE="$PREVIOUS_IMAGE" \
      bash "$STAGE_SCRIPT" --source-revision "$SOURCE_REVISION" --out "$STAGE_OUT" --json \
      >"$EVIDENCE/deploy-stage.stdout.json"
    require_file "$STAGE_OUT/release-manifest.json"
    require_file "$STAGE_OUT/image-lock.json"

    # Deploy exact package to production host without volume wipe.
    if [[ "${HOLO_CUTOVER_RELEASE_AUTHORIZE:-}" != "1" ]]; then
      fail_json "set HOLO_CUTOVER_RELEASE_AUTHORIZE=1 to authorize real production deploy for deployed-identity"
    fi
    SECRETS_PATH="${HOLO_SECRETS_PATH:-/Users/holocron/Projects/holocron/services/platform/config/secrets.yaml}"
    SECRET_ROOT="${HOLO_SECRET_STORE_ROOT:-$(dirname "$SECRETS_PATH")}"
    ssh_holocron "test -f '$SECRETS_PATH'" || fail_json "secrets path missing on $DEPLOY_HOST"

    # Copy staged lock to host evidence and apply.
    REMOTE_EVIDENCE="/tmp/CUTOVER-RELEASE-001-${RUN_ID}"
    ssh_holocron "mkdir -p '$REMOTE_EVIDENCE'"
    scp -o BatchMode=yes "$STAGE_OUT/image-lock.json" "$STAGE_OUT/release-manifest.json" \
      "$DEPLOY_HOST:$REMOTE_EVIDENCE/" >/dev/null
    scp -o BatchMode=yes -r "$ROOT/services/platform/deploy/compose" \
      "$DEPLOY_HOST:$REMOTE_EVIDENCE/compose" >/dev/null

    APPLY_OUT="$(ssh_holocron "cd /Users/holocron/Projects/holocron && \
      export PATH=/usr/local/bin:/Users/holocron/.bun/bin:\$PATH && \
      HOLO_SECRETS_PATH='$SECRETS_PATH' HOLO_SECRET_STORE_ROOT='$SECRET_ROOT' \
      HOLO_DEPLOY_TARGET='$DEPLOY_HOST' HOLO_PRODUCTION_BASE_URL='$BASE_URL' \
      bun services/platform/src/cli/holo.ts deploy:apply --authorize \
        --release '$REMOTE_EVIDENCE/image-lock.json' \
        --base-url '$BASE_URL' --target '$DEPLOY_HOST' --json" )" || fail_json "deploy:apply failed"
    printf '%s\n' "$APPLY_OUT" >"$EVIDENCE/deploy-apply.json"

    python3 - "$STAGE_OUT/release-manifest.json" "$BASE_URL" "$DEPLOY_HOST" "$EVIDENCE" <<'PY' || exit 1
import json, subprocess, sys, pathlib, urllib.request, ssl
manifest_path, base_url, host, evidence = sys.argv[1:5]
manifest=json.loads(pathlib.Path(manifest_path).read_text())
staged_rev=manifest["sourceRevision"]
staged_digests=set((manifest.get("imageDigests") or {}).values())
ctx=ssl.create_default_context()
health=json.load(urllib.request.urlopen(f"{base_url}/health", context=ctx, timeout=20))
# Independent container inspection on holocron
ps=subprocess.check_output([
  "ssh","-o","BatchMode=yes",host,
  "export PATH=/usr/local/bin:$PATH; docker compose -p holocron-production ps --format json"
], text=True)
# docker compose ps --format json may be NDJSON
containers=[]
for line in ps.splitlines():
  line=line.strip()
  if not line: continue
  try:
    containers.append(json.loads(line))
  except Exception:
    pass
if not containers and ps.strip().startswith("["):
  containers=json.loads(ps)

observed_images=[]
for c in containers:
  name=c.get("Service") or c.get("Name") or ""
  image=c.get("Image") or ""
  if image:
    observed_images.append(image)
insp=subprocess.check_output([
  "ssh","-o","BatchMode=yes",host,
  "export PATH=/usr/local/bin:$PATH; "
  "for s in mastra scheduler; do "
  "id=$(docker compose -p holocron-production ps -q $s); "
  "docker inspect --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}|{{index .Config.Labels \"io.holocron.source-revision\"}}|{{.Image}}|{{.Config.Image}}' $id; "
  "done"
], text=True).strip().splitlines()
observed_rev=None
observed_digest_set=set()
for row in insp:
  parts=row.split("|")
  for p in parts[:2]:
    if len(p)==40:
      observed_rev=p
  img=parts[-1] if parts else ""
  if "@sha256:" in img:
    observed_digest_set.add("sha256:"+img.split("@sha256:",1)[1])

# Durable fence from secrets on host
fence=subprocess.check_output([
  "ssh","-o","BatchMode=yes",host,
  "python3 - <<'P'\nfrom pathlib import Path\np=Path('/Users/holocron/Projects/holocron/services/platform/config/secrets.yaml')\nval=None\nfor line in p.read_text().splitlines():\n s=line.strip()\n if s.startswith('HOLO_MIGRATION_READ_ONLY:'):\n  val=s.split(':',1)[1].strip().strip('\"')\nprint(val or '')\nP"
], text=True).strip()

errors=[]
if observed_rev != staged_rev:
  errors.append(f"observedSourceRevision={observed_rev!r} != staged={staged_rev!r}")
if not observed_digest_set:
  errors.append("empty container digest")
# staged platform digest must be observed
plat= (manifest.get("imageDigests") or {}).get("platform")
if plat and plat not in observed_digest_set and not any(plat in i for i in observed_images):
  # compare against Config.Image digest set loosely
  if not any(plat.endswith(d.split(':',1)[-1]) for d in observed_digest_set):
    errors.append("observedImageDigestSet mismatch for platform")
if health.get("data_plane") != "convex":
  errors.append(f"health.data_plane={health.get('data_plane')!r}")
if fence != "1":
  errors.append(f"durableMigrationReadOnly={fence!r}")
# /health alone is insufficient — require container inspection fields
if not insp:
  errors.append("container inspection omitted")

out={
  "ok": len(errors)==0,
  "case":"deployed-identity",
  "observedSourceRevision": observed_rev,
  "stagedSourceRevision": staged_rev,
  "observedImageDigestSet": sorted(observed_digest_set),
  "stagedImageDigestSet": sorted(staged_digests),
  "healthDataPlane": health.get("data_plane"),
  "durableMigrationReadOnly": fence,
  "errors": errors,
}
pathlib.Path(evidence,"deployed-identity.json").write_text(json.dumps(out, indent=2)+"\n")
print(json.dumps(out))
sys.exit(0 if out["ok"] else 1)
PY
    ;;

  postgres-preserving-release-rollback)
    require_file "$PRIOR_RELEASE"
    PRE="$(ssh_holocron "export PATH=/usr/local/bin:\$PATH; docker volume inspect holocron-postgres holocron-blobs --format '{{.Name}}|{{.CreatedAt}}|{{.Mountpoint}}'")"
    printf '%s\n' "$PRE" >"$EVIDENCE/volumes-pre.txt"
    SECRETS_PATH="${HOLO_SECRETS_PATH:-/Users/holocron/Projects/holocron/services/platform/config/secrets.yaml}"
    SECRET_ROOT="${HOLO_SECRET_STORE_ROOT:-$(dirname "$SECRETS_PATH")}"
    if [[ "${HOLO_CUTOVER_RELEASE_AUTHORIZE:-}" != "1" ]]; then
      fail_json "set HOLO_CUTOVER_RELEASE_AUTHORIZE=1 to authorize rollback deploy"
    fi
    # Ship the prior verified lock to the deploy host (path may be laptop-local).
    REMOTE_PRIOR="/tmp/CUTOVER-RELEASE-001-${RUN_ID}-prior"
    ssh_holocron "mkdir -p '$REMOTE_PRIOR'"
    scp -o BatchMode=yes "$PRIOR_RELEASE" "$DEPLOY_HOST:$REMOTE_PRIOR/image-lock.json" >/dev/null
    # Redeploy prior verified Postgres-capable release (code only; never compose down -v).
    APPLY_OUT="$(ssh_holocron "cd /Users/holocron/Projects/holocron && \
      export PATH=/usr/local/bin:/Users/holocron/.bun/bin:\$PATH && \
      HOLO_SECRETS_PATH='$SECRETS_PATH' HOLO_SECRET_STORE_ROOT='$SECRET_ROOT' \
      bun services/platform/src/cli/holo.ts deploy:apply --authorize \
        --release '$REMOTE_PRIOR/image-lock.json' \
        --base-url '$BASE_URL' --target '$DEPLOY_HOST' --json")" || fail_json "prior release deploy failed"
    printf '%s\n' "$APPLY_OUT" >"$EVIDENCE/rollback-apply.json"
    POST="$(ssh_holocron "export PATH=/usr/local/bin:\$PATH; docker volume inspect holocron-postgres holocron-blobs --format '{{.Name}}|{{.CreatedAt}}|{{.Mountpoint}}'")"
    printf '%s\n' "$POST" >"$EVIDENCE/volumes-post.txt"
    HEALTH="$(curl -sk "$BASE_URL/health")"
    python3 - "$EVIDENCE/volumes-pre.txt" "$EVIDENCE/volumes-post.txt" "$HEALTH" "$EVIDENCE" <<'PY' || exit 1
import json,sys,pathlib
pre=pathlib.Path(sys.argv[1]).read_text().strip().splitlines()
post=pathlib.Path(sys.argv[2]).read_text().strip().splitlines()
health=json.loads(sys.argv[3])
evidence=sys.argv[4]
pre_map={line.split("|",1)[0]:line for line in pre if line}
post_map={line.split("|",1)[0]:line for line in post if line}
pg_diff = 0 if pre_map.get("holocron-postgres") and pre_map.get("holocron-postgres")==post_map.get("holocron-postgres") else 1
blob_diff = 0 if pre_map.get("holocron-blobs") and pre_map.get("holocron-blobs")==post_map.get("holocron-blobs") else 1
errors=[]
if not pre_map.get("holocron-postgres"):
  errors.append("empty pre-volume identity")
if pg_diff or blob_diff:
  errors.append("volume identity changed")
plane=health.get("data_plane")
if plane == "convex-fallback":
  errors.append("rollbackPlane is convex-fallback")
out={
  "ok": len(errors)==0 and pg_diff==0 and blob_diff==0,
  "case":"postgres-preserving-release-rollback",
  "postgresVolumeIdentityDiff": pg_diff,
  "blobVolumeIdentityDiff": blob_diff,
  "rollbackPlane": plane,
  "pre": pre_map,
  "post": post_map,
  "errors": errors,
}
pathlib.Path(evidence,"postgres-preserving-release-rollback.json").write_text(json.dumps(out, indent=2)+"\n")
print(json.dumps(out))
sys.exit(0 if out["ok"] else 1)
PY
    ;;

  *)
    fail_json "unknown case: $CASE"
    ;;
esac
