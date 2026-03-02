# EPIC: Red Hat Review Remediation 2026

**Epic ID**: `red-hat-remediation-2026`
**Source**: `.spec/reviews/red-hat-20260301.md`
**Created**: 2026-03-01
**Status**: PENDING

## Overview

This epic addresses all CRITICAL, HIGH, and MEDIUM confidence findings from the adversarial red-hat review of Epic 1: Foundation & Drawer Navigation. The review revealed structural integrity issues, critical security vulnerabilities, and missing implementations that block shipping.

## Waves & Dependencies

### Wave 0: Security & Infrastructure Foundation (No dependencies)
These tasks must complete first as they block all other work:
- US-100: Remove service role key from client (CRITICAL - security)
- US-101: Implement Row Level Security policies (CRITICAL - security)

### Wave 1: Authentication System (Depends on: Wave 0)
- US-102: Implement authentication system using Supabase Auth (CRITICAL - blocked by US-100, US-101)

### Wave 2: Missing P0 Implementations (Depends on: Wave 1)
- US-001: Implement Expo Router layout with drawer (CRITICAL - blocked by US-102)
- US-003: Implement Edge Functions for conversation CRUD (CRITICAL - blocked by US-102)
- US-005: Implement ConversationActionMenu component (CRITICAL - blocked by US-102)

### Wave 3: Navigation & Routing Fixes (Depends on: Wave 2)
- US-103: Resolve route contradiction between spec and implementation (HIGH - blocked by US-001)
- US-104: Add active conversation visual indicator to DrawerContent (HIGH - blocked by US-001)

### Wave 4: Error Handling & Reliability (Depends on: Wave 2)
- US-105: Add error boundary components and user-facing error states (HIGH - blocked by US-001)
- US-106: Implement retry mechanism for failed API calls (HIGH - blocked by US-003)
- US-107: Add loading states during mutation operations (HIGH - blocked by US-005)

### Wave 5: Backend API Completeness (Depends on: Wave 2)
- US-108: Add UPDATE/PATCH endpoint for conversation rename (HIGH - blocked by US-003)

### Wave 6: Performance & Scalability (Depends on: Wave 5)
- US-109: Add pagination to fetchConversations (MEDIUM - blocked by US-003)
- US-110: Implement optimistic UI updates (MEDIUM - blocked by US-003)
- US-111: Implement offline-first strategy with local caching (MEDIUM - blocked by US-003)

### Wave 7: Architecture & Documentation (Depends on: Wave 6)
- US-112: Resolve Supabase vs Convex technology stack contradiction (MEDIUM - blocked by US-003)
- US-113: Document security model and production migration path (MEDIUM - blocked by US-102)
- US-114: Wire up search functionality or defer search UI (MEDIUM - blocked by US-001)

### Wave 8: Polish & Validation (Depends on: Wave 7)
- US-115: Add analytics/telemetry for conversation operations (MEDIUM - blocked by US-003)
- US-116: Add accessibility validation and WCAG compliance (MEDIUM - blocked by US-001)

## Task Count by Severity

| Severity | Count | Tasks |
|----------|-------|-------|
| CRITICAL | 6 | US-100, US-101, US-102, US-001, US-003, US-005 |
| HIGH | 7 | US-103, US-104, US-105, US-106, US-107, US-108 |
| MEDIUM | 6 | US-109, US-110, US-111, US-112, US-113, US-114, US-115, US-116 |
| **TOTAL** | **17** | |

## Completion Criteria

- [ ] All CRITICAL severity tasks complete
- [ ] All HIGH severity tasks complete
- [ ] Security audit passes (no service role key in client, RLS enabled)
- [ ] Authentication system functional
- [ ] All missing P0 tasks implemented
- [ ] Navigation routes match specification
- [ ] Error boundaries and retry logic in place
- [ ] Backend API supports full CRUD operations
- [ ] Pagination and offline strategy implemented
- [ ] Technology stack documented and consistent

## References

- Original Review: `.spec/reviews/red-hat-20260301.md`
- Original Epic: `.spec/tasks/epic-1-foundation-drawer-navigation/`
- Task Standards: `brain/docs/kanban/task-standards.md`
