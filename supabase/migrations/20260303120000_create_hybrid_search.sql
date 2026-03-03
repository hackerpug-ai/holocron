-- Hybrid Search RPC Function (Memory-Efficient Version)
-- Computes tsvector on-the-fly instead of storing as generated column
-- @see US-026 - Build /search command handler with hybrid_search

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

-- Create HNSW index for vector similarity if not exists
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING hnsw(embedding vector_cosine_ops);

-- Hybrid search function (computes tsvector on-the-fly)
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
  search_query tsquery;
BEGIN
  -- Use provided embedding or NULL
  embedding_vector := query_embedding;

  -- Build search query for full-text search
  IF query_text IS NOT NULL AND query_text != '' THEN
    search_query := plainto_tsquery('english', query_text);
  ELSE
    search_query := NULL;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.category::TEXT,
    d.content,
    -- Vector similarity score (0-1)
    CASE
      WHEN embedding_vector IS NOT NULL AND d.embedding IS NOT NULL THEN
        1 - (d.embedding <=> embedding_vector)
      ELSE 0::FLOAT
    END AS similarity,
    -- Combined rank: FTS rank weighted with similarity
    CASE
      WHEN embedding_vector IS NOT NULL AND d.embedding IS NOT NULL THEN
        (COALESCE(ts_rank(
          setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
          search_query
        ), 0) * 0.5) +
        ((1 - (d.embedding <=> embedding_vector)) * 0.5)
      WHEN search_query IS NOT NULL THEN
        COALESCE(ts_rank(
          setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
          search_query
        ), 0)::FLOAT
      ELSE 0::FLOAT
    END AS rank
  FROM documents d
  WHERE
    -- Filter by category if provided
    (filter_category IS NULL OR d.category::TEXT = filter_category::TEXT)
    -- Full-text search match (if query provided)
    AND (
      search_query IS NULL
      OR (
        setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(d.content, '')), 'B')
      ) @@ search_query
    )
    -- Similarity threshold (if embedding provided)
    AND (
      embedding_vector IS NULL
      OR d.embedding IS NULL
      OR (1 - (d.embedding <=> embedding_vector)) >= match_threshold
    )
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
DECLARE
  search_query tsquery;
BEGIN
  search_query := plainto_tsquery('english', query_text);

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.category::TEXT,
    d.content,
    ts_rank(
      setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
      search_query
    )::FLOAT AS rank
  FROM documents d
  WHERE
    (filter_category IS NULL OR d.category::TEXT = filter_category::TEXT)
    AND (
      setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(d.content, '')), 'B')
    ) @@ search_query
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
    (1 - (d.embedding <=> query_embedding))::FLOAT AS similarity
  FROM documents d
  WHERE
    (filter_category IS NULL OR d.category::TEXT = filter_category::TEXT)
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search combining full-text and vector similarity. Returns documents ranked by combined FTS and semantic similarity scores.';
