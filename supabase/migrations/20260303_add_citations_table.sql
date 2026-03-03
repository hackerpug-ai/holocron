-- Migration: Create deep_research_citations table
-- PRD Reference: 08-uc-deep-research.md - UC-DR-04 AC-5
-- Task: US-062 - Add citations storage to schema
-- Red-hat review: .spec/reviews/red-hat-epic-5-20260303.md:48-58

-- ============================================================
-- Create deep_research_citations table
-- ============================================================
-- Stores citations accumulated across deep research iterations
-- Each citation belongs to one iteration (FK with CASCADE delete)
-- Supports multiple citation types: web, academic, youtube, pdf
CREATE TABLE deep_research_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id UUID NOT NULL REFERENCES deep_research_iterations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  snippet TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('web', 'academic', 'youtube', 'pdf')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- Indexes for deep_research_citations
-- ============================================================
-- Index for iteration-based queries (fetch all citations for an iteration)
CREATE INDEX idx_deep_research_citations_iteration ON deep_research_citations(iteration_id);

-- Index for source_type filtering (e.g., show only academic sources)
CREATE INDEX idx_deep_research_citations_source_type ON deep_research_citations(source_type);

-- Composite index for iteration + created_at (chronological ordering within iteration)
CREATE INDEX idx_deep_research_citations_iteration_created ON deep_research_citations(iteration_id, created_at DESC);

-- ============================================================
-- RLS (Row Level Security) Policies
-- ============================================================
-- Enable RLS on citations table
ALTER TABLE deep_research_citations ENABLE ROW LEVEL SECURITY;

-- User isolation policy: Users can only see citations from their own sessions
-- This policy joins through iterations → sessions → conversations → users
CREATE POLICY "Users can see own citations" ON deep_research_citations
  FOR SELECT USING (
    iteration_id IN (
      SELECT id FROM deep_research_iterations
      WHERE session_id IN (
        SELECT id FROM deep_research_sessions
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can insert citations for their own sessions
CREATE POLICY "Users can insert own citations" ON deep_research_citations
  FOR INSERT WITH CHECK (
    iteration_id IN (
      SELECT id FROM deep_research_iterations
      WHERE session_id IN (
        SELECT id FROM deep_research_sessions
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can update citations for their own sessions
CREATE POLICY "Users can update own citations" ON deep_research_citations
  FOR UPDATE USING (
    iteration_id IN (
      SELECT id FROM deep_research_iterations
      WHERE session_id IN (
        SELECT id FROM deep_research_sessions
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can delete citations for their own sessions
CREATE POLICY "Users can delete own citations" ON deep_research_citations
  FOR DELETE USING (
    iteration_id IN (
      SELECT id FROM deep_research_iterations
      WHERE session_id IN (
        SELECT id FROM deep_research_sessions
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Development policy: Allow all operations during testing
-- TODO: Remove this policy before production deployment
CREATE POLICY "Allow all access to deep_research_citations" ON deep_research_citations
  FOR ALL USING (true);

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON TABLE deep_research_citations IS 'Stores citations accumulated across deep research iterations';
COMMENT ON COLUMN deep_research_citations.id IS 'Unique identifier for each citation';
COMMENT ON COLUMN deep_research_citations.iteration_id IS 'Foreign key to the iteration that produced this citation';
COMMENT ON COLUMN deep_research_citations.title IS 'Title of the cited source';
COMMENT ON COLUMN deep_research_citations.url IS 'URL of the cited source (if applicable)';
COMMENT ON COLUMN deep_research_citations.snippet IS 'Relevant excerpt or quote from the source';
COMMENT ON COLUMN deep_research_citations.source_type IS 'Type of source: web, academic, youtube, or pdf';
COMMENT ON COLUMN deep_research_citations.metadata IS 'Additional source-specific data (authors, publication date, etc.)';
COMMENT ON COLUMN deep_research_citations.created_at IS 'Timestamp when citation was created';

-- ============================================================
-- Down migration
-- ============================================================
-- To rollback this migration, run:
DROP POLICY IF EXISTS "Allow all access to deep_research_citations" ON deep_research_citations;
DROP POLICY IF EXISTS "Users can delete own citations" ON deep_research_citations;
DROP POLICY IF EXISTS "Users can update own citations" ON deep_research_citations;
DROP POLICY IF EXISTS "Users can insert own citations" ON deep_research_citations;
DROP POLICY IF EXISTS "Users can see own citations" ON deep_research_citations;
ALTER TABLE deep_research_citations DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_deep_research_citations_iteration_created;
DROP INDEX IF EXISTS idx_deep_research_citations_source_type;
DROP INDEX IF EXISTS idx_deep_research_citations_iteration;
DROP TABLE IF EXISTS deep_research_citations;
