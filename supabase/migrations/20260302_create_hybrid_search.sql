-- Hybrid Search RPC Function
-- Combines full-text search and vector similarity for comprehensive document search
-- @see US-026 - Build /search command handler with hybrid_search

-- Ensure documents table exists
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT DEFAULT 'md',
  status TEXT DEFAULT 'complete',
  date TEXT,
  time TEXT,
  research_type TEXT,
  iterations INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  embedding VECTOR(1536)
);

-- Create document_category enum if not exists
DO $$ BEGIN
  CREATE TYPE document_category AS ENUM (
    'architecture', 'business', 'competitors', 'frameworks',
    'infrastructure', 'libraries', 'patterns', 'platforms',
    'security', 'research'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add category column with proper type if it doesn't exist
DO $$ BEGIN
  ALTER TABLE documents ALTER COLUMN category TYPE document_category USING category::document_category;
EXCEPTION
  WHEN others THEN null;
END $$;

-- Create full-text search vector column if not exists
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;
EXCEPTION
  WHEN others THEN null;
END $$;

-- Create GIN index for full-text search if not exists
CREATE INDEX IF NOT EXISTS idx_documents_tsv ON documents USING GIN(tsv);

-- Create HNSW index for vector similarity if not exists
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING hnsw(embedding vector_cosine_ops);

-- Hybrid search function
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT DEFAULT NULL,
  query_embedding VECTOR(1536) DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  result_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  category TEXT,
  content TEXT,
  similarity FLOAT,
  rank FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  embedding_vector VECTOR(1536);
BEGIN
  -- If embedding not provided, generate from query_text (fallback to simple expansion)
  -- Note: In production, you'd want to call an embedding generation service
  IF query_embedding IS NOT NULL THEN
    embedding_vector := query_embedding;
  ELSE
    -- Fallback: Use NULL embedding, results will rely on FTS only
    embedding_vector := NULL;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.category::TEXT,
    d.content,
    -- Vector similarity score (0-1)
    CASE
      WHEN embedding_vector IS NOT NULL THEN 1 - (d.embedding <=> embedding_vector)
      ELSE 0
    END AS similarity,
    -- Combined rank: FTS rank weighted with similarity
    CASE
      WHEN embedding_vector IS NOT NULL THEN
        (COALESCE(ts_rank(d.tsv, plainto_tsquery('english', query_text)), 0) * 0.5) +
        ((1 - (d.embedding <=> embedding_vector)) * 0.5)
      ELSE
        COALESCE(ts_rank(d.tsv, plainto_tsquery('english', query_text)), 0)
    END AS rank
  FROM documents d
  WHERE
    -- Filter by category if provided
    (filter_category IS NULL OR d.category = filter_category)
    -- Full-text search match
    AND (query_text IS NULL OR d.tsv @@ plainto_tsquery('english', query_text))
    -- Similarity threshold (if embedding provided)
    AND (embedding_vector IS NULL OR (1 - (d.embedding <=> embedding_vector)) >= match_threshold)
  ORDER BY rank DESC
  LIMIT result_count;
END;
$$;

-- Simple full-text search variant (no vector required)
CREATE OR REPLACE FUNCTION search_fts(
  query_text TEXT,
  match_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  category TEXT,
  content TEXT,
  rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.category::TEXT,
    d.content,
    ts_rank(d.tsv, plainto_tsquery('english', query_text)) AS rank
  FROM documents d
  WHERE
    (filter_category IS NULL OR d.category = filter_category)
    AND d.tsv @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- Pure vector search variant
CREATE OR REPLACE FUNCTION search_vector(
  query_embedding VECTOR(1536),
  match_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  category TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.category::TEXT,
    d.content,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE
    (filter_category IS NULL OR d.category = filter_category)
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search combining full-text and vector similarity. Returns documents ranked by combined FTS and semantic similarity scores.';
