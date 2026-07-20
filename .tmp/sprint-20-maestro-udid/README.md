# Sprint 20 Maestro name-to-UDID evidence

The harness now keeps `MAESTRO_DEVICE=iPhone 17` as the simulator name for
availability, bootstatus, terminate, uninstall, install, and metadata. It
queries the real `xcrun simctl list devices available --json` output with
Python 3, requires exactly one exact available name match, and passes the
resolved UDID only to Maestro.

`resolution-check.json` is the captured successful `--check` output from the
real local simulator. `focused-tests.txt` and `mandatory-gates.txt` record the
passing verification commands.

No full cold-boot Maestro run or CI provenance is claimed by this evidence.
