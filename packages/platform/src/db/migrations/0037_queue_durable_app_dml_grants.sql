-- S31-01 AC-3: holocron_app product DML for durable queue + job_runs.
-- 0011 granted SELECT/INSERT only on outbox/effects/inbox; queue:effect
-- resetDurable DELETEs and dispatchAndAck UPDATEs. 0012 granted SELECT/INSERT
-- on job_runs; jobs:run-all uses INSERT … ON CONFLICT DO UPDATE (needs UPDATE).

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holocron_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_outbox TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_effects TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE queue_inbox TO holocron_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE job_runs TO holocron_app';
  END IF;
END
$grants$;
