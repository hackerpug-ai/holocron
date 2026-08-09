-- Sprint 16: explicit article-to-file capability links.
-- Public asset reads require both a published share token and this relation.
CREATE TABLE IF NOT EXISTS "document_assets" (
  "document_id" text NOT NULL,
  "file_object_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "document_assets_pk" PRIMARY KEY ("document_id", "file_object_id")
);
CREATE INDEX IF NOT EXISTS "document_assets_file_object_idx"
  ON "document_assets" ("file_object_id");
