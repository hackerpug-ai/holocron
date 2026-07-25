BLOCKING FINDING: `scripts/e2e/run-maestro-reference-flow.sh:35` changed the prior non-directory diagnostic from:

`Expo development build is not a directory bundle: $bundle`

to:

`Expo development build does not exist: $bundle`

All other requested validations are present: Info.plist, nonempty identifiers, simple filename/path checks, symlink rejection, `-f`, `-x`, pre-simulator/reset ordering, and `--check` flow.

Validation passed:
- `bash -n scripts/e2e/run-maestro-reference-flow.sh`
- `git diff --check d845a86^ d845a86`
- No staged files.