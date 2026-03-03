-- Fix hybrid_search function type mismatches
-- The original function had type mismatches between RETURNS TABLE and SELECT columns

-- Drop existing functions first (required to change return types)
DROP FUNCTION IF EXISTS hybrid_search(TEXT, VECTOR(1536), FLOAT, INTEGER, document_category);
DROP FUNCTION IF EXISTS search_fts(TEXT, INTEGER, document_category);
DROP FUNCTION IF EXISTS search_vector(VECTOR(1536), INTEGER, document_category);

-- Recreate with explicit type casts
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT DEFAULT NULL,
  query_embedding VECTOR(1536) DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  result_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  category TEXT,
  content TEXT,
  similarity DOUBLE PRECISION,
  rank DOUBLE PRECISION
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
    d.id::BIGINT,
    d.title::TEXT,
    d.category::TEXT,
    d.content::TEXT,
    -- Vector similarity score (0-1)
    CASE
      WHEN embedding_vector IS NOT NULL AND d.embedding IS NOT NULL THEN
        (1 - (d.embedding <=> embedding_vector))::DOUBLE PRECISION
      ELSE 0::DOUBLE PRECISION
    END AS similarity,
    -- Combined rank: FTS rank weighted with similarity
    CASE
      WHEN embedding_vector IS NOT NULL AND d.embedding IS NOT NULL THEN
        ((COALESCE(ts_rank(
          setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
          search_query
        ), 0)::DOUBLE PRECISION * 0.5) +
        ((1 - (d.embedding <=> embedding_vector))::DOUBLE PRECISION * 0.5))
      WHEN search_query IS NOT NULL THEN
        COALESCE(ts_rank(
          setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
          search_query
        ), 0)::DOUBLE PRECISION
      ELSE 0::DOUBLE PRECISION
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

-- Also fix search_fts
CREATE OR REPLACE FUNCTION search_fts(
  query_text TEXT,
  match_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  category TEXT,
  content TEXT,
  rank DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
DECLARE
  search_query tsquery;
BEGIN
  search_query := plainto_tsquery('english', query_text);

  RETURN QUERY
  SELECT
    d.id::BIGINT,
    d.title::TEXT,
    d.category::TEXT,
    d.content::TEXT,
    ts_rank(
      setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(d.content, '')), 'B'),
      search_query
    )::DOUBLE PRECISION AS rank
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

-- Also fix search_vector
CREATE OR REPLACE FUNCTION search_vector(
  query_embedding VECTOR(1536),
  match_count INTEGER DEFAULT 10,
  filter_category document_category DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  category TEXT,
  content TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id::BIGINT,
    d.title::TEXT,
    d.category::TEXT,
    d.content::TEXT,
    (1 - (d.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
  FROM documents d
  WHERE
    (filter_category IS NULL OR d.category::TEXT = filter_category::TEXT)
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search IS 'Hybrid search combining full-text and vector similarity. Returns documents ranked by combined FTS and semantic similarity scores.';
