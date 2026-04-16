# Recommendation Upgrade Tasks

Generated: 2026-04-16  
Source artifact: `/Users/justinrich/Projects/holocron/.spec/prd/recommendation-upgrade/README.md`  
Target PRD: `/Users/justinrich/Projects/holocron/.spec/prd/recommendation-upgrade/README.md`

## Overview

- Project: `recommendation-upgrade`
- Epics: `2`
- Tasks: `6`
- Average task quality score: `108/115`
- Source type: `prd`

## Epics

1. [Rich Recommendation Engine](./rich-recommendation-engine/EPIC.md)
2. [Recommendation Trust Signal UI](./recommendation-trust-signal-ui/EPIC.md)

## Dependency Graph

```text
REC-UPG-01 -> REC-UPG-02 -> REC-UPG-03
REC-UPG-01 -> RECO-UI-01 -> RECO-UI-02 -> RECO-UI-03
REC-UPG-03 -> RECO-UI-01
```

## Source Coverage

- `FR-1`: `REC-UPG-01`, `REC-UPG-03`, `RECO-UI-01`
- `FR-2`: `REC-UPG-02`
- `FR-3`: `REC-UPG-03`
- `FR-4`: `REC-UPG-01`
- `FR-5`: `REC-UPG-01`, `REC-UPG-02`, `REC-UPG-03`, `RECO-UI-02`
- `FR-6`: all tasks
- `FR-7`: `RECO-UI-01`, `RECO-UI-02`, `RECO-UI-03`

## Parallelization Notes

- `REC-UPG-01` is the contract gate for all downstream work.
- `REC-UPG-02` and early UI adapter prep can begin after `REC-UPG-01`, but `REC-UPG-03` depends on `REC-UPG-02`.
- `RECO-UI-02` depends on `RECO-UI-01`.
- `RECO-UI-03` should land after `RECO-UI-02` so stories and tests match the final render contract.

## Usage

Run the first epic:

```bash
/kb-run-epic --prd /Users/justinrich/Projects/holocron/.spec/prd/recommendation-upgrade/README.md rich-recommendation-engine
```

Then run the UI epic:

```bash
/kb-run-epic --prd /Users/justinrich/Projects/holocron/.spec/prd/recommendation-upgrade/README.md recommendation-trust-signal-ui
```

## Quality Metrics

- Human-testable epic grouping: passed
- Max tasks per epic: passed
- Imperative human test steps per epic: passed
- Project-specialist mapping: passed via `CLAUDE.md` local domain experts
- Backward compatibility explicitly covered: passed

