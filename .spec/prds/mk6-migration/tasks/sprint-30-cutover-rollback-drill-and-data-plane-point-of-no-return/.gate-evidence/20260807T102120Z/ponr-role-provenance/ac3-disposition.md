# RH-S30-18 disposition

- probe_mode: `set_role_holocron_app_residual`
- probe_current_user: `holocron_app`
- rows_preserved: True
- triggers_enabled_after: True
- production_sqlstate_claim: True
- disable: denied=True sqlstate=42501
- truncate/update/delete fail_closed: True/True/True

Supersedes unsafe RH-S30-13 destroy-then-check probe.
