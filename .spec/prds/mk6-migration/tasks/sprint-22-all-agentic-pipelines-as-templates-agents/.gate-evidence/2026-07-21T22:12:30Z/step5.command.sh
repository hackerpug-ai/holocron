cd /Users/inference1/Projects/holocron && ( bun run services/platform/src/cli/holo.ts verify:no-shells ) > /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.raw 2>&1
EC=$?
tee -a /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.log < /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.raw
echo "@@GATE-EXIT=$EC@@" >> /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.log
printf "%s" "$EC" > /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.exit
rm -f /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/2026-07-21T22:12:30Z/step4.raw
