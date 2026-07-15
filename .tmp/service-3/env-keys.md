# Scoped API keys (env)

```
HOLO_KEY_RN=rn-test          # or RN_API_KEY
HOLO_KEY_MCP=mcp-test        # or MCP_API_KEY
HOLO_KEY_CONTROL=ctl-test    # or CONTROL_API_KEY
```

Clients send: `Authorization: Bearer <key>`

Optional fleet:
```
FLEET_MANIFEST_PATH=services/platform/fleet/manifest.json
FLEET_URL=http://127.0.0.1:4545/v1
```
