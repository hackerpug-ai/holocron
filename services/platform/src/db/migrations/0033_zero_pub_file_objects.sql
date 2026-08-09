-- Keep the live Zero publication aligned with app/zero/schema.ts.
-- Sprint 26 added the reactive file_objects query, but the publication boundary
-- still excluded the table, causing zero-cache to reject the entire client schema.
ALTER TABLE file_objects REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'zero_pub'
      AND schemaname = 'public'
      AND tablename = 'file_objects'
  ) THEN
    ALTER PUBLICATION zero_pub ADD TABLE file_objects;
  END IF;
END
$$;
