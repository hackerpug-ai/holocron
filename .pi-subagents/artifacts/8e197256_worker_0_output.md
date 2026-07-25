Implemented bundle validation hardening.

Changed files: `scripts/e2e/run-maestro-reference-flow.sh`  
Commit: `d845a86`

Validation passed:
- `bash -n`
- `git diff --check`
- Temporary probes: empty, traversal, symlink rejected; valid bundle accepted
- Pre-commit hooks: typecheck and 917 unit tests passed
- Working tree clean; no staged files