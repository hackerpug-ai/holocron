# Role map

- supplied_role: `inference1` superuser=True owner=True
- table_owner: `inference1`
- probe_mode: `product_libpq_pguser`
- probe_current_user during DDL: `holocron_app`
- production app role: `holocron_app`
- product connection: libpq `PGUSER=holocron_app`
