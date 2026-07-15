# REDHAT-FIX-RH-1 — Apply consolidated secrets to launchd-managed Mastra at service:up

## Source
Red-hat closeout RH-1 (HIGH): secrets doctor resolves HOLO_KEY_* from secrets.yaml, but holocron-mastra launchd env only has DATABASE_URL/PORT/FLEET_URL/HOLO_ROOT; service:up never loadConsolidatedSecrets; Bearer from secrets.yaml returns 401.

## Acceptance
- [x] AC-1: `service:up` / `startService` loads consolidated secrets into process.env before scoped-key middleware initializes (env wins over file for already-set keys)
- [x] AC-2: After `holo stack up`, curl with HOLO_KEY_RN from secrets.yaml against a scoped route returns non-401-unknown-key (200 or route-appropriate, not "unknown API key")
- [x] AC-3: Prefer loading at process start (do NOT write secret values into 0644 LaunchAgent plists)
- [x] AC-4: Integration evidence: real stack + real curl; no mocks

## Scope (writeAllowed)
- services/platform/src/index.ts (startService)
- services/platform/src/cli/holo.ts (service:up path)
- services/platform/src/config/** (if helper needed to apply secrets to env)
- services/platform/src/**/__tests__/** (tests)
- .tmp/REDHAT-FIX-RH-1/**

writeProhibited: app/**, holocron-mcp/**, writing plaintext secrets into *.plist files

## Verify
```bash
bun services/platform/src/cli/holo.ts stack up
# extract HOLO_KEY_RN from secrets without printing full value in logs if possible
KEY=$(python3 -c "from pathlib import Path; import re; t=Path('services/platform/config/secrets.yaml').read_text(); m=re.search(r'HOLO_KEY_RN:\\s*[\"\\']?([^\\s\"\\']+)', t); print(m.group(1) if m else '')")
code=$(curl -s -o /tmp/rh1.json -w '%{http_code}' -X POST -H "Authorization: Bearer $KEY" http://127.0.0.1:4111/api/missions/x/steer)
echo HTTP_$code; cat /tmp/rh1.json
# expect not: unknown API key
test "$code" != "401" -o "$(grep -c 'unknown API key' /tmp/rh1.json)" = "0" || test "$code" = "200"
```

RUNTIME_COMMANDS:
  test: PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint: pnpm biome check .
