# Subscriptions Redesign - PRD

**Product**: Holocron Subscriptions & What's New
**Version**: 1.0
**Created**: 2026-04-01
**Appetite**: 3-4 weeks
**Status**: Draft

## Document Index

| File | Description |
|------|-------------|
| [00-overview.md](./00-overview.md) | Product vision and description |
| [01-scope.md](./01-scope.md) | Appetite, in-scope, out-of-scope |
| [02-user-stories.md](./02-user-stories.md) | User stories and acceptance criteria |
| [03-functional-requirements.md](./03-functional-requirements.md) | Functional requirements by feature area |
| [04-technical-considerations.md](./04-technical-considerations.md) | Technical architecture and implementation notes |
| [05-success-metrics.md](./05-success-metrics.md) | Success metrics and KPIs |

## Quick Reference

| Metric | Value |
|--------|-------|
| Functional Areas | 3 |
| User Stories | 12 |
| New Components | 8 |
| Backend Changes | 5 |
| API Endpoints | 8 |

## Problem Statement

The current subscriptions experience has three key issues:

1. **Subscription management is top-level navigation** - Settings-like functionality (managing subscriptions) occupies prime navigation real estate
2. **What's New is text-heavy** - Current feed lacks rich multimedia support and visual engagement
3. **No personalization** - Users cannot influence content relevance through feedback

## Solution Overview

1. **Move subscriptions to settings** - Demote subscription management from main drawer to settings screen
2. **Redesign What's New as multimedia card stream** - Fixed card-based layout with images, embedded content, and AI summaries
3. **Add feedback-driven recommendations** - "More like this" / "Less like this" buttons that train the AI agent

## Version History

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0 | 2026-04-01 | Initial PRD | New initiative |

## Next Steps

- `/kb-project-plan` - Build implementation plan
- `/pixel-perfect:design` - Generate UI design artifacts
