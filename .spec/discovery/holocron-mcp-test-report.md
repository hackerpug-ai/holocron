# Holocron MCP Integration Test Report

**Date**: 2026-03-08
**Tester**: Claude Code
**Status**: ⚠️ PARTIAL - Setup incomplete

---

## Executive Summary

**Critical Finding**: The `holocron-general` MCP server was created during this session but **is NOT installed or configured**. Additionally, several skills reference **WRONG tool names** that don't exist.

### Current State

| Component | Status | Issue |
|-----------|--------|-------|
| holocron-research MCP | ✅ CONFIGURED | Working correctly |
| holocron-general MCP | ❌ NOT INSTALLED | Created but not configured |
| MCP Configuration | ⚠️ INCOMPLETE | Missing holocron-general entry |
| Skill Tool References | ❌ BROKEN | Wrong naming convention |

---

## MCP Server Status

### 1. holocron-research (WORKING ✅)

**Server**: `holocron-mcp`
**Configuration**: `~/.config/claude/mcp.json`

```json
{
  "mcpServers": {
    "holocron-research": {
      "command": "holocron-mcp"
    }
  }
}
```

**Tools Provided**:
1. ✅ `mcp__holocron__research_topic` - Deep research (polling, 2-5 min)
2. ✅ `mcp__holocron__get_research_session` - Retrieve session by ID
3. ✅ `mcp__holocron__search_research` - Search research findings

**Status**: Fully functional

### 2. holocron-general (NOT INSTALLED ❌)

**Server**: `holocron-general-mcp`
**Expected Location**: Should be in `~/.config/claude/mcp.json`

**Tools Should Provide**:
1. ❌ `hybrid_search` - Vector + FTS combined search
2. ❌ `search_fts` - Full-text search
3. ❌ `search_vector` - Semantic vector search
4. ❌ `get_document` - Get document by ID
5. ❌ `list_documents` - List documents with filters
6. ❌ `store_document` - Create new document
7. ❌ `update_document` - Update existing document

**Status**: Code exists in `holocron-general-mcp/` but NOT installed

---

## Skill Test Results

### Skills Using MCP Tools (5 found)

#### 1. deep-research ✅ WORKING

**Tool References**:
- `mcp__holocron__research_topic`
- `mcp__holocron__get_research_session`
- `mcp__holocron__search_research`

**Status**: ✅ ALL CORRECT - Uses holocron-research server
**Testing**: Can be invoked with `/deep-research` (not directly invocable, used by agents)

#### 2. research ❌ BROKEN (Wrong Tool Names)

**Skill Location**: `~/.claude/skills/research/SKILL.md`

**Tool References**:
- ❌ `mcp__holocron__hybrid_search` (should exist in holocron-general)
- ❌ `mcp__holocron__search_fts` (should exist in holocron-general)
- ❌ `mcp__holocron__search_vector` (should exist in holocron-general)
- ❌ `mcp__holocron__get_document` (should exist in holocron-general)

**Problem**: References tools from `holocron-general` server which is NOT installed

**Fix Required**:
1. Install holocron-general-mcp globally
2. Add to `~/.config/claude/mcp.json`

#### 3. ask ❌ BROKEN (Wrong Tool Names)

**Skill Location**: `~/.claude/skills/ask/SKILL.md`

**Tool References**:
- ❌ `holocron_mcp__hybrid_search` (WRONG NAME - should be `mcp__holocron_general__hybrid_search`)
- ❌ `holocron_mcp__get_document` (WRONG NAME - should be `mcp__holocron_general__get_document`)

**Problem**: Uses wrong naming convention (`holocron_mcp__*` instead of `mcp__holocron_general__*`)

**Fix Required**:
1. Install holocron-general-mcp
2. Update skill to use correct tool names

#### 4. agent-plan ❌ BROKEN (Wrong Tool Names)

**Skill Location**: `~/.claude/skills/agent-plan/SKILL.md`

**Tool References**:
- ❌ `holocron_mcp__hybrid_search` (WRONG NAME)
- ❌ `holocron_mcp__search_fts` (WRONG NAME)
- ❌ `holocron_mcp__search_vector` (WRONG NAME)

**Problem**: Uses wrong naming convention (`holocron_mcp__*` instead of `mcp__holocron_general__*`)

**Fix Required**:
1. Install holocron-general-mcp
2. Update skill to use correct tool names

#### 5. skill-plan ❌ BROKEN (Wrong Tool Names)

**Skill Location**: `~/.claude/skills/skill-plan/SKILL.md`

**Tool References**:
- ❌ `holocron_mcp__hybrid_search` (WRONG NAME)
- ❌ `holocron_mcp__search_fts` (WRONG NAME)
- ❌ `holocron_mcp__search_vector` (WRONG NAME)
- ❌ `holocron_mcp__get_document` (WRONG NAME)

**Problem**: Uses wrong naming convention (`holocron_mcp__*` instead of `mcp__holocron_general__*`)

**Fix Required**:
1. Install holocron-general-mcp
2. Update skill to use correct tool names

---

## Tool Naming Convention Issues

### Current (WRONG)

Skills are using:
```
holocron_mcp__hybrid_search
holocron_mcp__search_fts
holocron_mcp__search_vector
holocron_mcp__get_document
```

### Should Be (CORRECT)

Based on MCP server naming convention:
```
mcp__holocron_general__hybrid_search
mcp__holocron_general__search_fts
mcp__holocron_general__search_vector
mcp__holocron_general__get_document
```

**Pattern**: `mcp__{server-name}__{tool-name}`

### Why the Confusion?

The old implementation (before MCP migration) likely used `holocron_mcp__*` as a placeholder naming convention. The **actual MCP tools** follow the standard pattern:

- Server: `holocron-research`
  Tools: `mcp__holocron__research_topic`, `mcp__holocron__get_research_session`, etc.

- Server: `holocron-general`
  Tools: `mcp__holocron_general__hybrid_search`, `mcp__holocron_general__search_fts`, etc.

---

## Required Actions

### Step 1: Install holocron-general MCP Server

```bash
cd holocron-general-mcp
npm install -g .
```

### Step 2: Configure MCP Server

Edit `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
    "holocron-research": {
      "command": "holocron-mcp"
    },
    "holocron-general": {
      "command": "holocron-general-mcp"
    }
  }
}
```

### Step 3: Create Configuration File

```bash
mkdir -p ~/.config/holocron-general-mcp

cat > ~/.config/holocron-general-mcp/.env << 'EOF'
# Convex deployment URL
CONVEX_URL=https://bright-pug-766.convex.cloud

# OpenAI API key (for embeddings)
OPENAI_API_KEY=sk-xxx
EOF
```

**Note**: Replace `CONVEX_URL` and `OPENAI_API_KEY` with actual values

### Step 4: Fix Skill Tool References

Update 4 skills to use correct tool names:

**Files to Update**:
1. `~/.claude/skills/ask/SKILL.md`
2. `~/.claude/skills/agent-plan/SKILL.md`
3. `~/.claude/skills/skill-plan/SKILL.md`
4. `~/.claude/skills/research/SKILL.md`

**Find & Replace**:

| Old (Wrong) | New (Correct) |
|-------------|---------------|
| `holocron_mcp__hybrid_search` | `mcp__holocron_general__hybrid_search` |
| `holocron_mcp__search_fts` | `mcp__holocron_general__search_fts` |
| `holocron_mcp__search_vector` | `mcp__holocron_general__search_vector` |
| `holocron_mcp__get_document` | `mcp__holocron_general__get_document` |
| `mcp__holocron__hybrid_search` | `mcp__holocron_general__hybrid_search` |
| `mcp__holocron__search_fts` | `mcp__holocron_general__search_fts` |
| `mcp__holocron__search_vector` | `mcp__holocron_general__search_vector` |
| `mcp__holocron__get_document` | `mcp__holocron_general__get_document` |

### Step 5: Restart Claude Code

After configuration changes, restart Claude Code to reload MCP servers.

### Step 6: Verify Installation

```bash
# Check if holocron-general-mcp is installed
which holocron-general-mcp

# Should output: /usr/local/bin/holocron-general-mcp (or similar)
```

### Step 7: Test MCP Tools

Try invoking skills that use MCP tools:
- `/ask {question}` - Should use `mcp__holocron_general__hybrid_search`
- `/deep-research {topic}` - Should use `mcp__holocron__research_topic`

---

## Test Coverage Summary

| Skill | MCP Tools Used | Status | Fix Priority |
|-------|---------------|--------|--------------|
| deep-research | holocron-research | ✅ WORKING | N/A |
| research | holocron-general | ❌ NOT INSTALLED | HIGH |
| ask | holocron-general | ❌ WRONG NAMES | HIGH |
| agent-plan | holocron-general | ❌ WRONG NAMES | MEDIUM |
| skill-plan | holocron-general | ❌ WRONG NAMES | MEDIUM |

---

## Root Cause Analysis

### Why Did This Happen?

1. **Original Implementation**: Used direct Convex access (not MCP)
2. **First Migration Attempt**: Created `holocron-mcp` for research tools only
3. **Tool Naming Mismatch**: Skills used placeholder `holocron_mcp__*` before MCP server existed
4. **Incomplete Migration**: `holocron-general` server was designed but never installed

### Prevention

- **Test MCP tools immediately after configuration changes**
- **Verify skill tool references match actual MCP server tool names**
- **Document MCP tool naming conventions in CLAUDE.md**

---

## Success Criteria

✅ **Complete** when:
- [ ] holocron-general-mcp installed globally
- [ ] ~/.config/claude/mcp.json updated
- [ ] ~/.config/holocron-general-mcp/.env created
- [ ] All 4 skills updated with correct tool names
- [ ] Claude Code restarted
- [ ] /ask skill successfully queries holocron
- [ ] /deep-research skill successfully runs research

---

## Next Steps

1. **Complete Step 1-3** (Installation & Configuration)
2. **Complete Step 4** (Fix skill tool references)
3. **Complete Step 5** (Restart Claude Code)
4. **Run comprehensive test** to verify all skills work
5. **Update migration plan** with completion status

**Estimated Time**: 30-45 minutes for complete setup and testing

---

## Related Documents

- **Implementation Report**: `.spec/discovery/phase2-implementation-complete.md`
- **Infrastructure Discovery**: `.spec/discovery/phase1-infrastructure-discovery.md`
- **Migration Plan**: Original plan document (if exists)
