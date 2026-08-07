# Empty-table wrapper must fail

This script exits 2 when `before_count < 1` (and HOLO_PROBE_SEED_PONR!=1).
An empty `data_plane_ponr` table cannot establish PONR preservation.
