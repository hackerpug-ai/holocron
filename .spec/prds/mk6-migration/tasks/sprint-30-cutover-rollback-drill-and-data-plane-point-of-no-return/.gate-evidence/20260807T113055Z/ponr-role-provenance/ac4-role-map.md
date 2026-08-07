# Role map

- supplied_role: `inference1` superuser=True owner=True
- table_owner: `inference1`
- probe_mode: `product_url_rewrite`
- probe_current_user during DDL: `holocron_app`
- production app role: `holocron_app`
- product rewrite: services/platform/src/db/evidence/roles.ts `toAppRoleDatabaseUrl`
