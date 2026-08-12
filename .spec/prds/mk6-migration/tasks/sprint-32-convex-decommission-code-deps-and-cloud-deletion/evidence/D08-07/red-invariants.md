# D08-07 RED invariants (red_first remediation)

Captured against the pre-fix stub behavior (commit d056f6af) and proven by negative
controls in the GREEN suite after remediation.

| Invariant | RED behavior (d056f6af) | GREEN assertion |
|-----------|-------------------------|-----------------|
| live_service_count===0 | treated as OK | fails closed; IMP-AC-14 negative control rejects empty containers |
| memory_drift_rejected | in-process plan inequality only | compares receipt.memoryLimitsGib to live HostConfig.Memory |
| identity_mismatch when health≠200 | soft-passed true | never soft-passes; requires IDENTITY_MISMATCH/STALE_IDENTITY |
| IMP-AC-14 mock health/LAN alone | sufficient for green | requires docker inspect (×4) + volume inspect (×2) binding |
| runOrFail stderr | embedded unredacted | errors are `command args failed (exit N)` only |
| holocron volumes | not checked | live_volumes requires holocron-postgres + holocron-blobs |

Negative control (from IMP-AC-14 test): verifyPortableDeploymentReceipt with non-existent
container IDs and a runner that returns inspect failures rejects with live_services failure.
