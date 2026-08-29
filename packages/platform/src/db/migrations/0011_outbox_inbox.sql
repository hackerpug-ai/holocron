-- queue-2: transactional outbox/inbox + idempotency keys + fenced consumer.
-- Exactly-once observable effects: the outbox intent, the observable effect,
-- and the inbox dedupe outcome are each keyed by a stable idempotency key with
-- a UNIQUE constraint, so a kill-9 + replay can never produce zero or two.
-- CRITICAL: the effect and the dedupe row are written in the SAME transaction
-- (see queue/durable.ts dispatchAndAck) — never split across transactions.

CREATE TABLE IF NOT EXISTS "queue_outbox" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "fence_token" text,
  "effect_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "dispatched_at" timestamptz,
  "acked_at" timestamptz,
  CONSTRAINT "queue_outbox_status_check" CHECK (
    status IN ('pending', 'dispatched', 'acked')
  )
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "queue_outbox_key_uidx"
  ON "queue_outbox" ("key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_outbox_status_idx"
  ON "queue_outbox" ("status")
  WHERE status <> 'acked';
--> statement-breakpoint

-- Observable side effects — exactly one row per idempotency key.
CREATE TABLE IF NOT EXISTS "queue_effects" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "key" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fence_token" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "queue_effects_key_uidx"
  ON "queue_effects" ("key");
--> statement-breakpoint

-- Inbox dedupe ledger — exactly one terminal outcome per idempotency key.
CREATE TABLE IF NOT EXISTS "queue_inbox" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "key" text NOT NULL,
  "outbox_id" uuid REFERENCES "queue_outbox" ("id") ON DELETE CASCADE,
  "effect_id" uuid REFERENCES "queue_effects" ("id") ON DELETE CASCADE,
  "fence_token" text NOT NULL,
  "outcome" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "queue_inbox_outcome_check" CHECK (outcome IN ('applied', 'deduped'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "queue_inbox_key_uidx"
  ON "queue_inbox" ("key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_inbox_outcome_idx" ON "queue_inbox" ("outcome");

--> statement-breakpoint

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE queue_outbox TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE queue_effects TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE queue_inbox TO holocron_app';
  END IF;
END
$grants$;
