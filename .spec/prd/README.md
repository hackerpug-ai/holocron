# Holocron Mobile Research Interface - PRD

Chat-centric mobile research app with slash commands, result cards, and conversational AI agent access to the holocron knowledge base.

## PRD Metadata

| Field | Value |
|-------|-------|
| Version | 3.1.0 |
| Appetite | 2 weeks |
| Scope Level | core |
| Created | 2026-02-28 |
| Last Updated | 2026-03-01 |

## Document Index

| File | Section | Stability |
|------|---------|-----------|
| [00-overview.md](./00-overview.md) | Product description, problem statement, solution | PRODUCT_CONTEXT |
| [01-scope.md](./01-scope.md) | In scope / out of scope | FEATURE_SPEC |
| [02-roles.md](./02-roles.md) | User roles | PRODUCT_CONTEXT |
| [03-functional-groups.md](./03-functional-groups.md) | Functional group overview and use case summary | FEATURE_SPEC |
| [04-uc-navigation.md](./04-uc-navigation.md) | UC-NV-01 through UC-NV-04 | FEATURE_SPEC |
| [05-uc-chat-interface.md](./05-uc-chat-interface.md) | UC-CI-01 through UC-CI-04 | FEATURE_SPEC |
| [06-uc-knowledge-base.md](./06-uc-knowledge-base.md) | UC-KB-01 through UC-KB-05 | FEATURE_SPEC |
| [07-uc-research.md](./07-uc-research.md) | UC-RS-01 through UC-RS-04 | FEATURE_SPEC |
| [08-uc-deep-research.md](./08-uc-deep-research.md) | UC-DR-01 through UC-DR-04 | FEATURE_SPEC |
| [09-uc-article-management.md](./09-uc-article-management.md) | UC-AM-01 through UC-AM-04 | FEATURE_SPEC |
| [10-team-contributions.md](./10-team-contributions.md) | Phase contributions (personas, architecture, UI) | - |
| [11-technical-requirements.md](./11-technical-requirements.md) | System components, data schema, API design, architecture | CONSTITUTION |

## Quick Stats

| Metric | Value |
|--------|-------|
| Functional Groups | 6 |
| Use Cases | 25 |
| System Components | 7 |
| Data Entities | 6 |
| API Endpoints | 19 |
| External Dependencies | 5 |

## Version History

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-02-28 | Initial PRD | New initiative |
| 2.0.0 | 2026-03-01 | Chat-centric UX paradigm: main chat view, slash commands, result cards, new CI functional group | Scope change |
| 3.0.0 | 2026-03-01 | Drawer navigation, multi-conversation support, articles browse view, new NV functional group (4 UCs), UC-KB-05, conversations table, 4 conversation API endpoints | Scope change |
| 3.1.0 | 2026-03-01 | UC-CI-02: Command typeahead panel above input, "/" action button trigger, real-time filtering, dismiss on no match | UC criteria update |

> :warning: FEATURE_SPEC changed in v3.1.0. Re-run `/kb-project-plan --delta-replan`

## Next Steps

- `/kb-project-plan` - Build implementation plan
- `/pixel-perfect:design` - Generate UI design artifacts
- `/trd-plan` - Generate detailed TRD
