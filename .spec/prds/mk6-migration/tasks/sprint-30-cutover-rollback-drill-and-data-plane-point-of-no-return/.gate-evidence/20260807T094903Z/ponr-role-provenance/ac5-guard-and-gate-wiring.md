# Guard + gate wiring (RH-S30-18)

## Hard guards
1. Preflight before any ALTER/TRUNCATE/UPDATE/DELETE.
2. Refuse bare superuser/owner DDL on PONR-holding DB without app-role rebind.
3. All probe DML/DDL inside BEGIN…ROLLBACK (always abort via RAISE).
4. Postflight fails closed if rows change or triggers left disabled.
5. NEVER the pre-C-3 sequence: DISABLE TRIGGER ALL; TRUNCATE; UPDATE (unscoped).

## Gate wiring
- `scripts/run-sprint30-human-gate.sh` invokes this script into
  `.gate-evidence/<run_id>/ponr-role-provenance/` and copies to
  `.tmp/REDHAT-FIX-RH-S30-18/`.
- H-3 must not close without ac1/ac2 production_sqlstate_claim artifacts.
