# Holocron MCP Server Setup

## Claude Code Configuration

The Holocron MCP server is configured in `~/.claude/settings.json` under the `mcpServers` section.

### Working Configuration

```json
{
  "mcpServers": {
    "holocron": {
      "type": "stdio",
      "command": "/Users/justinrich/.bun/bin/bun",
      "args": ["dist/stdio.js"],
      "cwd": "/Users/justinrich/Projects/holocron/holocron-mcp",
      "env": {
        "HOLOCRON_URL": "https://acrobatic-echidna-253.convex.cloud",
        "HOLOCRON_DEPLOY_KEY": "dev:acrobatic-echidna-253|...",
        "HOLOCRON_OPENAI_API_KEY": "sk-proj-..."
      }
    }
  }
}
```

### Key Configuration Points

1. **Direct Bun Execution** - Use absolute path to `bun` binary and pass `dist/stdio.js` as argument
2. **Working Directory** - Set `cwd` to the `holocron-mcp` directory so relative paths work
3. **Type Field** - Must include `"type": "stdio"` for stdio transport
4. **Environment Variables** - All `HOLOCRON_*` env vars must be set

### What Changed

**Before (Broken):**
```json
{
  "command": "/Users/justinrich/Projects/holocron/holocron-mcp/start-mcp.sh",
  "args": []
}
```

**After (Working):**
```json
{
  "command": "/Users/justinrich/.bun/bin/bun",
  "args": ["dist/stdio.js"],
  "cwd": "/Users/justinrich/Projects/holocron/holocron-mcp"
}
```

### Why the Wrapper Script Failed

The wrapper script approach (`start-mcp.sh`) had issues with:
- Working directory context when invoked by Claude Code
- Potential issues with shell script execution permissions
- Indirection that made debugging harder

Using direct `bun` execution is more reliable and follows the pattern used by working MCP servers like `ship-commander`.

## Verification

After updating the configuration:

1. **Restart Claude Code** - Configuration changes require a full restart
2. **Check for tools** - Holocron tools should appear with prefix `mcp__holocron__*`:
   - `mcp__holocron__hybrid_search`
   - `mcp__holocron__get_document`
   - `mcp__holocron__research_topic`
   - `mcp__holocron__simple_research`
   - etc.

3. **Check logs** - Server logs are written to `/tmp/holocron-mcp.log`

## Testing Manually

Test the server without Claude Code:

```bash
cd /Users/justinrich/Projects/holocron/holocron-mcp

# Set environment variables
export HOLOCRON_URL="https://acrobatic-echidna-253.convex.cloud"
export HOLOCRON_DEPLOY_KEY="dev:acrobatic-echidna-253|..."
export HOLOCRON_OPENAI_API_KEY="sk-proj-..."

# Run server
/Users/justinrich/.bun/bin/bun dist/stdio.js
```

Server should log startup messages to stderr and wait for JSON-RPC messages on stdin.

## Common Issues

### Server doesn't appear in Claude Code

- Verify `~/.claude/settings.json` syntax is valid JSON
- Ensure `bun` path is correct: `/Users/justinrich/.bun/bin/bun`
- Check environment variables are set
- Restart Claude Code completely

### Server fails to start

- Check `/tmp/holocron-mcp.log` for error messages
- Verify `dist/stdio.js` exists and is up to date
- Run `bun build` to rebuild if needed
- Test manually with the command above

### Tools don't show up

- Check that permissions include `mcp__holocron__*` in settings.json
- Look for the permissions entry: `"mcp__holocron__*"` in the `allow` array
- Restart Claude Code after adding permissions

## Stdio Protocol Requirements

**Critical**: The MCP stdio protocol requires:
- All logging MUST go to `stderr` (not `stdout`)
- Only JSON-RPC messages on `stdout`
- The server correctly uses `console.error()` for all logging

This is why the server has a custom `log()` function that writes to both stderr and a file.

## Sources

- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code MCP Servers Guide](https://www.builder.io/blog/claude-code-mcp-servers)
- [Configuring MCP Tools in Claude Code](https://scottspence.com/posts/configuring-mcp-tools-in-claude-code)
