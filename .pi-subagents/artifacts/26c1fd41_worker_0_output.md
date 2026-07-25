Review result: **BLOCKING findings; not PASS**.

- **Blocking:** `scripts/e2e/run-maestro-reference-flow.sh:33-45` allows `CFBundleExecutable=../outside` (or an external symlink) because it only checks `"$bundle/$bundle_exec"` with `-f/-x`; an executable outside the bundle can satisfy validation.
- **Blocking:** Lines 33–45 changed the old guard’s failure text (`Expo development build does not exist: ...`) to unrelated messages, breaking the existing fail-closed diagnostic contract.

Verified:
- Function call line 60 precedes simulator discovery (line 62), `--check` (line 65), and namespace reset (line 71).
- Both plist fields are read and checked nonempty.
- Executable is checked with `-f` and `-x`.
- `--check` remains before reset.
- `bash -n` and `git diff --check` passed.
- No files were edited or committed; Sprint 20 human gate not assessed.