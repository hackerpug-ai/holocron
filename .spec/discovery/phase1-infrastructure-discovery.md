# Phase 1: Infrastructure Discovery Report

**Date**: 2026-03-08
**Status**: ✅ COMPLETE

## Executive Summary

**Critical Finding**: The plan references MCP tools (`holocron_mcp__hybrid_search`, `holocron_mcp__get_document`, etc.) that **DO NOT EXIST**. The existing `holocron-mcp` server ONLY provides deep research tools, not general document operations.

**Required Action**: We must create a **NEW MCP server** for general holocron operations before migrating skills.

---

## Current Infrastructure

### 1. Holocron MCP Server (Research Tools Only)

**Location**: `holocron-mcp/`
**Package**: `@holocron/mcp-research` (v0.1.0)
**Purpose**: Deep research functionality with polling

**Tools Provided**:
1. `research_topic` - Start deep research, poll until complete (2-5 min)
2. `get_research_session` - Retrieve session by ID
3. `search_research` - Hybrid search across **research findings only**

**Configuration**:
- Install path: `~/.config/holocron-mcp/.env`
- Required env vars: `CONVEX_URL`, `OPENAI_API_KEY`, `EXA_API_KEY`, `JINA_API_KEY`
- Polling: 2s interval, 5min timeout

**Files**:
```
holocron-mcp/
├── src/
│   ├── index.ts                      # MCP server entry
│   ├── tools/
│   │   ├── research.ts               # research_topic tool
│   │   ├── session.ts                # get_research_session tool
│   │   └── search.ts                 # search_research tool
│   ├── convex/
│   │   ├── client.ts                 # Convex client
│   │   └── types.ts                  # Type imports
│   ├── polling/
│   │   └── strategies.ts             # Polling logic
│   └── config/
│       ├── env.ts                    # Environment loading
│       └── validation.ts             # Credential validation
├── package.json
└── README.md
```

**Limitation**: ❌ Does NOT provide general document search/storage tools

---

### 2. Convex Backend (Holocron Deployment)

**Location**: `convex/documents/`
**Deployment**: `~/Projects/holocron` (Convex deployment)

#### Available Queries (`convex/documents/queries.ts`)

✅ **Implemented and Ready**:
- `get(id)` - Get document by ID
- `list(category?, limit?)` - List documents with filters
- `count()` - Get total document count
- `countByCategory()` - Get counts by category
- `getSampleWithEmbedding()` - Sample document for validation
- `vectorSearch(embedding, limit?, category?)` - Semantic search
- `fullTextSearch(query, limit?, category?)` - Keyword search

#### Available Actions (`convex/documents/search.ts`)

✅ **Implemented and Ready**:
- `hybridSearch(query, embedding, limit?, category?)` - Combined vector + FTS (50/50 weighted)

#### Available Mutations (`convex/documents/mutations.ts`)

✅ **Implemented and Ready**:
- `create(title, content, category, ...)` - Create new document
- `update(id, ...)` - Update existing document
- `insertFromMigration(...)` - Insert with full control (for migrations)
- `clearAll()` - Clear all documents (testing only)

#### Schema (`convex/schema.ts`)

✅ **Complete Schema**:
```typescript
documents: defineTable({
  title: v.string(),
  content: v.string(),
  category: v.string(),
  filePath: v.optional(v.string()),
  fileType: v.optional(v.string()),
  status: v.optional(v.string()),
  date: v.optional(v.string()),
  time: v.optional(v.string()),
  researchType: v.optional(v.string()),
  iterations: v.optional(v.number()),
  embedding: v.optional(v.array(v.float64())), // 1536 dimensions
  createdAt: v.number(),
})
  .searchIndex("by_category", { searchField: "category" })
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
  })
```

✅ **Assimilation Support**:
```typescript
assimilationMetadata: defineTable({
  documentId: v.id("documents"),
  repositoryUrl: v.string(),
  repositoryName: v.string(),
  primaryLanguage: v.optional(v.string()),
  stars: v.optional(v.number()),
  sophisticationRating: v.number(), // 1-5 scale
  trackRatings: v.object({
    architecture: v.number(),
    patterns: v.number(),
    documentation: v.number(),
    dependencies: v.number(),
    testing: v.number(),
  }),
  createdAt: v.number(),
})
  .index("by_document", ["documentId"])
  .index("by_repository", ["repositoryName"])
```

**Conclusion**: ✅ Convex backend is COMPLETE and ready for MCP wrapper

---

## Gap Analysis

### Missing MCP Tools

The plan references these MCP tools that **DO NOT EXIST**:

| Tool Name | Referenced By | Expected Function | Status |
|-----------|---------------|-------------------|--------|
| `holocron_mcp__hybrid_search` | `/ask`, `/research` | Hybrid search (vector + FTS) | ❌ MISSING |
| `holocron_mcp__get_document` | `/ask` | Get document by ID | ❌ MISSING |
| `holocron_mcp__search_fts` | `/research` | Full-text search | ❌ MISSING |
| `holocron_mcp__search_vector` | `/research` | Vector search | ❌ MISSING |
| `store_document` | `/assimilate` | Create/store document | ❌ MISSING |
| `update_document` | `/assimilate` | Update document | ❌ MISSING |

**Impact**: Skills that reference these tools are **BROKEN** or using direct Convex access

### Skills Analysis

#### Skills Using Direct Convex Access (Need Migration)

1. **`/holocron`** - `~/.claude/skills/holocron/`
   - Current: Uses `ConvexHttpClient` directly
   - Reads: `EXPO_PUBLIC_CONVEX_URL` from `~/.claude/.env`
   - Calls: `convex/documents/queries:fullTextSearch`
   - Migration: Needs `search_fts` or `hybrid_search` MCP tool

2. **`/assimilate`** - `~/.claude/skills/assimilate/`
   - Current: Uses direct Convex mutations
   - Deployment: `deploymentSelector="~/Projects/holocron"`
   - Calls: Direct mutations to store reports
   - Migration: Needs `store_document` MCP tool

3. **`/librarian`** - `~/.claude/skills/librarian/`
   - Current: Uses Supabase Python client (`holocron_client.py`)
   - Operations: Validation, deduplication, index rebuild
   - Migration: Needs validation/maintenance MCP tools (future phase)

#### Skills Already Using MCP (Reference Non-Existent Tools)

1. **`/ask`** - `~/.claude/skills/ask/`
   - References: `holocron_mcp__hybrid_search`, `holocron_mcp__get_document`
   - Status: ❌ BROKEN - these tools don't exist

2. **`/research`** - `~/.claude/skills/research/`
   - References: `holocron_mcp__hybrid_search`, `holocron_mcp__search_fts`, `holocron_mcp__search_vector`
   - Status: ❌ BROKEN - these tools don't exist

3. **`/deep-research`** - `~/.claude/skills/deep-research/`
   - References: `mcp__holocron_research__*` tools
   - Status: ✅ WORKS - uses real `holocron-research` server

4. **`/dependency-research`** - `~/.claude/skills/dependency-research/`
   - References: MCP resource tools
   - Status: ❓ UNKNOWN - need to verify

---

## Required Actions

### Phase 2: Create General Holocron MCP Server

**Recommendation**: Create a NEW MCP server named `holocron-general` (separate from `holocron-research`)

**Rationale**:
1. **Separation of Concerns**: Research tools need polling, general tools don't
2. **Different Use Cases**: Research = long-running operations, general = instant queries
3. **Maintainability**: Easier to version and update independently
4. **Already Established Pattern**: `holocron-research` exists, follow same structure

#### Required Tools for `holocron-general` MCP Server

**Search Tools** (no polling, instant response):
1. `hybrid_search` - Wraps `convex/documents/search:hybridSearch`
2. `search_fts` - Wraps `convex/documents/queries:fullTextSearch`
3. `search_vector` - Wraps `convex/documents/queries:vectorSearch`
4. `get_document` - Wraps `convex/documents/queries:get`
5. `list_documents` - Wraps `convex/documents/queries:list`

**Storage Tools** (mutations):
6. `store_document` - Wraps `convex/documents/mutations:create`
7. `update_document` - Wraps `convex/documents/mutations:update`

**Future Tools** (for `/librarian` migration - Phase 5):
8. `validate_metadata` - Validation logic (to be implemented)
9. `find_duplicates` - Semantic deduplication (to be implemented)
10. `rebuild_indexes` - Index maintenance (to be implemented)

#### Convex Backend Extensions Needed

**For `/librarian` (Phase 5 only)**:
- Add `validateDocumentMetadata` query
- Add `findDuplicateDocuments` query (semantic search based)
- Add `rebuildIndexes` action (if doesn't exist)

**For `/assimilate` (Phase 3)**:
- ✅ Already has `create` mutation
- ✅ Already has `update` mutation
- ✅ Already has `assimilationMetadata` schema

---

## Implementation Path

### Immediate Next Steps (Phase 2)

1. **Create `holocron-general` MCP Server**
   - Location: `holocron-mcp-general/` (new directory)
   - Package: `@holocron/mcp-general`
   - Install: `npm install -g .`
   - Config: `~/.config/holocron-general-mcp/.env`

2. **Implement 7 Core Tools**:
   - `hybrid_search`, `search_fts`, `search_vector`
   - `get_document`, `list_documents`
   - `store_document`, `update_document`

3. **Add to Claude Code MCP Config**:
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

4. **Verify Installation**:
   ```bash
   claude mcp list
   # Should show:
   # - holocron-research (3 tools)
   # - holocron-general (7 tools)
   ```

### Skill Migration Order (Phase 3-5)

**Phase 3: Migrate `/holocron` skill**
- Replace `ConvexHttpClient` with MCP `search_fts` or `hybrid_search`
- Remove `EXPO_PUBLIC_CONVEX_URL` from `.env`
- Test search functionality

**Phase 4: Migrate `/assimilate` skill**
- Replace direct Convex mutations with MCP `store_document`
- Remove `deploymentSelector` hardcoded path
- Test report storage

**Phase 5: Migrate `/librarian` skill** (deferred)
- Requires additional Convex functions (validation, deduplication)
- Requires additional MCP tools wrapping those functions
- Complex Python → TypeScript migration

---

## Architecture Comparison

### Before: Direct Access (Current State)

```
Skill → ConvexHttpClient → Convex Backend
Skill → Supabase Client → Supabase
Skill → Python Script → Shell Script → Index Rebuild
```

**Issues**:
- Each skill implements own retry logic
- Environment variables scattered (`~/.claude/.env`, skill-specific)
- Not portable across harnesses (Claude Code specific)
- Inconsistent error handling
- No centralized logging

### After: MCP Layer (Target State)

```
Skill → MCP Protocol → holocron-general MCP → Convex Backend
                                           → Supabase (future)
                                           → Index Operations (future)

Skill → MCP Protocol → holocron-research MCP → Convex Backend (research)
```

**Benefits**:
- ✅ Unified retry logic in MCP servers
- ✅ Single configuration point per MCP server
- ✅ Portable across harnesses (Claude Code, Cursor, OpenCode, Windsurf)
- ✅ Consistent error handling and logging
- ✅ Easier to add caching layer later
- ✅ Better separation of concerns
- ✅ Centralized credential management

---

## Files Inventory

### Convex Backend (This Repo)

| File | Status | Purpose |
|------|--------|---------|
| `convex/documents/queries.ts` | ✅ Complete | Search queries, document retrieval |
| `convex/documents/mutations.ts` | ✅ Complete | Document creation, updates |
| `convex/documents/search.ts` | ✅ Complete | Hybrid search action |
| `convex/documents/index.ts` | ✅ Exists | Export file |
| `convex/schema.ts` | ✅ Complete | Schema definitions |

### MCP Server (This Repo)

| File | Status | Purpose |
|------|--------|---------|
| `holocron-mcp/src/index.ts` | ✅ Complete | Research MCP server |
| `holocron-mcp/src/tools/research.ts` | ✅ Complete | research_topic tool |
| `holocron-mcp/src/tools/session.ts` | ✅ Complete | get_research_session tool |
| `holocron-mcp/src/tools/search.ts` | ✅ Complete | search_research tool |
| `holocron-mcp/README.md` | ✅ Complete | Documentation |

### Global Claude Skills (To Migrate)

| Skill | Location | Current Method | Status |
|-------|----------|----------------|--------|
| `/holocron` | `~/.claude/skills/holocron/` | Direct ConvexHttpClient | ⚠️ NEEDS MIGRATION |
| `/assimilate` | `~/.claude/skills/assimilate/` | Direct Convex mutations | ⚠️ NEEDS MIGRATION |
| `/librarian` | `~/.claude/skills/librarian/` | Supabase Python client | ⚠️ NEEDS MIGRATION (Phase 5) |
| `/ask` | `~/.claude/skills/ask/` | MCP (broken references) | ⚠️ NEEDS FIXING |
| `/research` | `~/.claude/skills/research/` | MCP (broken references) | ⚠️ NEEDS FIXING |
| `/deep-research` | `~/.claude/skills/deep-research/` | MCP (working) | ✅ WORKS |

---

## Configuration Files

### Current Configuration

**`~/.claude/.env`** (global):
```bash
EXPO_PUBLIC_CONVEX_URL=https://[deployment].convex.cloud
# Used by /holocron skill directly
```

**`~/.config/holocron-mcp/.env`** (MCP research):
```bash
CONVEX_URL=https://[deployment].convex.cloud
OPENAI_API_KEY=sk-xxx
EXA_API_KEY=exa_xxx
JINA_API_KEY=jina_xxx
HOLOCRON_MCP_POLL_INTERVAL=2000
HOLOCRON_MCP_TIMEOUT=300000
```

### Target Configuration (After Migration)

**`~/.config/holocron-general-mcp/.env`** (NEW):
```bash
CONVEX_URL=https://[deployment].convex.cloud
OPENAI_API_KEY=sk-xxx  # For embeddings (hybrid_search)
```

**`~/.config/holocron-mcp/.env`** (unchanged):
```bash
CONVEX_URL=https://[deployment].convex.cloud
OPENAI_API_KEY=sk-xxx
EXA_API_KEY=exa_xxx
JINA_API_KEY=jina_xxx
HOLOCRON_MCP_POLL_INTERVAL=2000
HOLOCRON_MCP_TIMEOUT=300000
```

**`~/.claude/.env`** (remove):
```bash
# Remove EXPO_PUBLIC_CONVEX_URL after migration
```

---

## Open Questions (Resolved)

### Q1: Where is the general holocron MCP server?
**A**: ❌ It doesn't exist. Must be created.

### Q2: What tools does it provide?
**A**: N/A - Must implement: `hybrid_search`, `search_fts`, `search_vector`, `get_document`, `list_documents`, `store_document`, `update_document`

### Q3: Are Convex functions ready?
**A**: ✅ YES - All needed functions exist in `convex/documents/`

### Q4: What about consolidation?
**A**: Keep separate - `holocron-research` (polling) vs `holocron-general` (instant)

### Q5: Python utilities migration?
**A**: Defer to Phase 5 - focus on `/holocron` and `/assimilate` first

---

## Success Criteria

✅ **Phase 1 Complete** when:
- [x] Located existing MCP server (holocron-research)
- [x] Documented all existing MCP tools (3 research tools)
- [x] Audited Convex backend (queries, mutations, actions, schema)
- [x] Identified missing MCP tools (7 general tools)
- [x] Determined architecture approach (create holocron-general)

**Next Phase**: Create `holocron-general` MCP server with 7 core tools

---

## Recommendations

1. **High Priority**: Create `holocron-general` MCP server immediately
2. **Medium Priority**: Migrate `/holocron` skill (most critical, widely used)
3. **Medium Priority**: Migrate `/assimilate` skill (reduces direct Convex dependency)
4. **Low Priority**: Defer `/librarian` migration (maintenance task, less frequent)
5. **Architecture**: Keep separate MCP servers for research vs general operations

**Estimated Effort**:
- Create `holocron-general` MCP: 2-4 hours
- Migrate `/holocron` skill: 30 minutes
- Migrate `/assimilate` skill: 1 hour
- Migrate `/librarian` skill: 4-6 hours (requires new Convex functions)

**Total**: ~8-12 hours for full migration
