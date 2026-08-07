# Role map

- supplied_role: `holocron` superuser=True owner=True
- table_owner: `holocron`
- probe_mode: `set_role_holocron_app_residual`
- probe_current_user during DDL: `holocron_app`
- production app role: `holocron_app`
- product rewrite: services/platform/src/db/evidence/roles.ts `toAppRoleDatabaseUrl`
