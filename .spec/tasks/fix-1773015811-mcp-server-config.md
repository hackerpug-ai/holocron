# Fix: MCP Server Configuration

**Created**: 2026-03-08T00:50:11Z
**Mode**: Quick
**Implementer**: devops-engineer
**Reviewer**: code-reviewer

## Problem
Holocron MCP server won't load in Claude Code when configured in `~/.claude/settings.json`. The server works correctly when run manually from the command line, but Claude Code fails to initialize it.

## Context from Previous Attempts
1. Multiple holocron processes running from earlier tests (cleaned up)
2. Initial config used `bun run dist/stdio.js` which is incorrect (bun run expects package.json script names)
3. Changed to `/Users/justinrich/.bun/bin/bun dist/stdio.js` with absolute path
4. Created wrapper script `/Users/justinrich/Projects/holocron/holocron-mcp/start-mcp.sh`
5. Current config uses wrapper script but still failing

## Current Configuration
Location: `~/.claude/settings.json`
```json
{
  "holocron": {
    "type": "stdio",
    "command": "/Users/justinrich/Projects/holocron/holocron-mcp/start-mcp.sh",
    "args": [],
    "env": {
      "HOLOCRON_URL": "https://acrobatic-echidna-253.convex.cloud",
      "HOLOCRON_DEPLOY_KEY": "dev:acrobatic-echidna-253|eyJ2MiI6IjgwZGIxOGQxMDZhNzRmNzc4ODBkM2IyY2ViZmRjZGNmIn0=",
      "HOLOCRON_OPENAI_API_KEY": "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"
    }
  }
}
```

Wrapper script: `/Users/justinrich/Projects/holocron/holocron-mcp/start-mcp.sh`
```bash
#!/usr/bin/env bash
# Holocron MCP Server Launcher
cd "$(dirname "$0")"
exec /Users/justinrich/.bun/bin/bun dist/stdio.js
```

## Acceptance Criteria
✓ MCP tools appear when Claude Code restarts (holocron tools like hybrid_search, get_document visible in tool list)
✓ No errors in Claude Code logs related to MCP connection
✓ Configuration works reliably across Claude Code restarts

## Investigation Points
1. Check if Claude Code can execute the wrapper script
2. Verify wrapper script permissions (should be +x)
3. Check if there are Claude Code-specific MCP configuration requirements
4. Consider whether `~/.claude.json` should be used instead of `~/.claude/settings.json`
5. Review MCP stdio protocol requirements
6. Check for Claude Code log files that might show MCP initialization errors
