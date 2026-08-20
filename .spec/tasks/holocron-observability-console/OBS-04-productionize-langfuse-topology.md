# OBS-04: Productionize the Langfuse Service Topology

**Status:** Planned
**Owner:** `mastra-implementer`
**Reviewer:** `mastra-reviewer`
**Dependencies:** OBS-01

## Objective

Move the existing Langfuse overlay into Holocron's immutable production release as
separate, pinned services with real secrets, capacity controls, persistence,
backup, restore, and rollback.

## Acceptance Criteria

1. The release lock and production Compose contract pin Langfuse web, worker,
   ClickHouse, Redis, object storage, and Langfuse PostgreSQL by immutable digest;
   none are installed in the Mastra application image.
2. Production startup has no example/default credentials or fallback salts. It
   fails closed on missing secret names and never prints values in argv, logs,
   receipts, or evidence.
3. Service-count, volume-count, CPU, memory, disk, health, dependency ordering,
   graceful shutdown, and preflight assertions cover the expanded topology.
4. Langfuse uses isolated database/schema credentials and volumes. Backup scope,
   restore order, retention, and migration compatibility are explicit.
5. A real cold start initializes the intended organization/project, accepts OTLP
   traces, survives a full restart, and stays within measured resource budgets.
6. A real isolated restore recovers a known trace and score; a rollback preserves
   compatible state or fails closed with a documented recovery path.

## Evidence

- Image/source locks and deployed digest proof.
- Secret-name and default-value scans.
- Real service health, restart, capacity, backup, restore, and rollback receipts.
- Independent adversarial review with stub/placeholder scan.
