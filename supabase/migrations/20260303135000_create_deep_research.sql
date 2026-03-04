-- Migration: Create deep_research_sessions and deep_research_iterations tables
-- PRD Reference: 08-uc-deep-research.md - UC-DR-01, UC-DR-02, UC-DR-03, UC-DR-04
-- Task: US-054 - Create deep research session database schema

-- ============================================================
-- Create ENUM types for session and iteration statuses
-- ============================================================
CREATE TYPE deep_research_session_status AS ENUM ('pending', 'running', 'paused', 'completed', 'cancelled');
CREATE TYPE deep_research_iteration_status AS ENUM ('pending', 'running', 'completed');

-- ============================================================
-- Create deep_research_sessions table
-- ============================================================
-- Stores metadata for deep research sessions
-- Each session can have multiple iterations tracked in deep_research_iterations
CREATE TABLE deep_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  max_iterations INTEGER DEFAULT 5,
  status deep_research_session_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================
-- Create deep_research_iterations table
-- ============================================================
-- Stores individual iterations within a deep research session
-- Each iteration belongs to one session (FK with CASCADE delete)
CREATE TABLE deep_research_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES deep_research_sessions(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  coverage_score NUMERIC(3, 2),
  feedback TEXT,
  refined_queries JSONB,
  findings TEXT,
  status deep_research_iteration_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_session_iteration UNIQUE (session_id, iteration_number)
);

-- ============================================================
-- Indexes for deep_research_sessions
-- ============================================================
-- Index for status-based queries (e.g., fetch all running/paused sessions)
CREATE INDEX idx_deep_research_sessions_status ON deep_research_sessions(status);
-- Index for time-based sorting (most recent first)
CREATE INDEX idx_deep_research_sessions_created ON deep_research_sessions(created_at DESC);
-- Index for conversation lookups
CREATE INDEX idx_deep_research_sessions_conversation ON deep_research_sessions(conversation_id);

-- ============================================================
-- Indexes for deep_research_iterations
-- ============================================================
-- Index for session-based queries (fetch all iterations for a session)
CREATE INDEX idx_deep_research_iterations_session ON deep_research_iterations(session_id);
-- Composite index for session + iteration_number (ordered queries)
CREATE INDEX idx_deep_research_iterations_session_number ON deep_research_iterations(session_id, iteration_number);
-- Index for status-based queries
CREATE INDEX idx_deep_research_iterations_status ON deep_research_iterations(status);

-- ============================================================
-- Trigger to update updated_at timestamp
-- ============================================================
-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_deep_research_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for deep_research_sessions
CREATE TRIGGER trigger_update_deep_research_sessions_updated_at
  BEFORE UPDATE ON deep_research_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_deep_research_updated_at();

-- Trigger for deep_research_iterations
CREATE TRIGGER trigger_update_deep_research_iterations_updated_at
  BEFORE UPDATE ON deep_research_iterations
  FOR EACH ROW
  EXECUTE FUNCTION update_deep_research_updated_at();

-- ============================================================
-- RLS (Row Level Security) Policies
-- ============================================================
-- Enable RLS on both tables
ALTER TABLE deep_research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_research_iterations ENABLE ROW LEVEL SECURITY;

-- Note: User isolation policies will be added in a future task
-- when authentication is implemented. For now, we enable RLS
-- but allow all access during development.

-- Development policy: Allow all operations (remove in production)
CREATE POLICY "Allow all access to deep_research_sessions" ON deep_research_sessions
  FOR ALL USING (true);

CREATE POLICY "Allow all access to deep_research_iterations" ON deep_research_iterations
  FOR ALL USING (true);

-- ============================================================
-- Down migration
-- ============================================================
-- To rollback this migration, run:
DROP TRIGGER IF EXISTS trigger_update_deep_research_iterations_updated_at ON deep_research_iterations;
DROP TRIGGER IF EXISTS trigger_update_deep_research_sessions_updated_at ON deep_research_sessions;
DROP FUNCTION IF EXISTS update_deep_research_updated_at();
DROP POLICY IF EXISTS "Allow all access to deep_research_iterations" ON deep_research_iterations;
DROP POLICY IF EXISTS "Allow all access to deep_research_sessions" ON deep_research_sessions;
ALTER TABLE deep_research_iterations DISABLE ROW LEVEL SECURITY;
ALTER TABLE deep_research_sessions DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_deep_research_iterations_status;
DROP INDEX IF EXISTS idx_deep_research_iterations_session_number;
DROP INDEX IF EXISTS idx_deep_research_iterations_session;
DROP INDEX IF EXISTS idx_deep_research_sessions_conversation;
DROP INDEX IF EXISTS idx_deep_research_sessions_created;
DROP INDEX IF EXISTS idx_deep_research_sessions_status;
DROP TABLE IF EXISTS deep_research_iterations;
DROP TABLE IF EXISTS deep_research_sessions;
DROP TYPE IF EXISTS deep_research_iteration_status;
DROP TYPE IF EXISTS deep_research_session_status;
