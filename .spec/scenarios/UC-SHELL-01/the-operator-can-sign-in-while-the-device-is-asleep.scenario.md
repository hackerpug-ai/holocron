---
service: operator-shell
feature: UC-SHELL-01
priority: P0
type: error_handling
tier: holdout
---

# The operator can sign in while the device is asleep

Stop the device platform and close the tunnel, then sign in from a fresh profile. Authentication must succeed and the shell must render with its navigation intact and both destination links present, because the session must not depend on the sleeping machine. The destinations may - and should - name that the archive host is unreachable, but the operator must not be locked out of the application, presented with a sign-in failure, or held on an indefinite spinner.
