-- ledger-3: as-of belief lookup + validity-windowed net-support (SQL-based)
--
-- belief_as_of(claim_id, as_of):
--   tx_from <= as_of AND (tx_to IS NULL OR tx_to > as_of)
--   AND (valid_from IS NULL OR valid_from <= as_of)
--   AND (valid_to IS NULL OR valid_to > as_of)
--
-- belief_net_support(claim_id, as_of):
--   SUM(+1 supports, -1 contradicts) on open edges (tx_to IS NULL)
--   with valid_from <= as_of AND (valid_to IS NULL OR valid_to > as_of)

CREATE OR REPLACE FUNCTION belief_as_of(
  p_claim_id text,
  p_as_of timestamptz
) RETURNS SETOF beliefs
LANGUAGE sql
STABLE
AS $fn$
  SELECT b.*
  FROM beliefs b
  WHERE b.claim_id = p_claim_id
    AND b.tx_from <= p_as_of
    AND (b.tx_to IS NULL OR b.tx_to > p_as_of)
    AND (b.valid_from IS NULL OR b.valid_from <= p_as_of)
    AND (b.valid_to IS NULL OR b.valid_to > p_as_of)
  ORDER BY b.tx_from DESC
  LIMIT 1;
$fn$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION belief_net_support(
  p_claim_id text,
  p_as_of timestamptz
) RETURNS integer
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(SUM(
    CASE r.relation_type
      WHEN 'supports' THEN 1
      WHEN 'contradicts' THEN -1
      ELSE 0
    END
  ), 0)::integer
  FROM relations r
  WHERE r.object_id = p_claim_id
    AND r.relation_type IN ('supports', 'contradicts')
    AND r.tx_to IS NULL
    AND r.valid_from IS NOT NULL
    AND r.valid_from <= p_as_of
    AND (r.valid_to IS NULL OR r.valid_to > p_as_of);
$fn$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION belief_as_of(text, timestamptz) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION belief_as_of(text, timestamptz) TO PUBLIC;
--> statement-breakpoint

REVOKE ALL ON FUNCTION belief_net_support(text, timestamptz) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION belief_net_support(text, timestamptz) TO PUBLIC;
--> statement-breakpoint

DO $grant_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION belief_as_of(text, timestamptz) TO holocron_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION belief_net_support(text, timestamptz) TO holocron_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_owner') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION belief_as_of(text, timestamptz) TO holocron_owner';
    EXECUTE 'GRANT EXECUTE ON FUNCTION belief_net_support(text, timestamptz) TO holocron_owner';
  END IF;
END
$grant_roles$;
