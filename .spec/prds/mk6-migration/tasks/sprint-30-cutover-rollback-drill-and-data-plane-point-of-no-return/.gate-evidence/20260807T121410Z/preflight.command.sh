cd /Users/inference1/Projects/holocron && ( GATE_RUN_ID=20260807T121410Z HOLO_VERIFY_BASE_URL=http://127.0.0.1:44121 bash scripts/run-sprint30-human-gate.sh ) > .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.raw 2>&1
EC=$?
tee -a .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.log < .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.raw
echo "@@GATE-EXIT=$EC@@" >> .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.log
printf "%s" "$EC" > .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.exit
rm -f .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T121410Z/preflight.raw
