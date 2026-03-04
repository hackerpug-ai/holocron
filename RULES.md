# Rules

This document outlines the rules and standards for the holocron project.

---

## Logging Requirements

All new functionality MUST include structured logging:

- Use `log('category').info()` for operations
- Use `log('category').error()` for errors with context
- Use `await logger.logOperation()` for timed operations
- Log all API requests with request/response context
- Log all errors with error details and stack traces

### Client-Side Usage

```typescript
import { log } from '@/lib/logger-client'

const logger = log('MyComponent')

// Basic logging
logger.info('Component mounted', { props })
logger.warn('Unexpected state', { state })
logger.error('Failed operation', error, { context })

// Operation timing
const result = await logger.logOperation(
  'fetchData',
  () => api.fetch(),
  { id }
)
```

### Server-Side Usage (Supabase Edge Functions)

```typescript
import { log } from '../_shared/logging'

const logger = log('MyFunction')

logger.info('Processing request', { requestId })
logger.error('Request failed', error, { context })
```

---

## React & React Native Rules

See `CLAUDE.md` for comprehensive React and React Native development rules including:

- Hook usage guidelines (useCallback, useMemo, useReducer, custom hooks)
- Import guidelines (named exports preferred)
- State management patterns
- Theme rules (semantic tokens)
- Validation gates

---

## Code Style

- Use named exports for better tree-shaking
- Avoid prop drilling beyond 1 level
- Follow TypeScript best practices
- No `any` types without justification

---

## Testing

- All new features require tests
- Use TDD where appropriate
- Test files should be co-located with source files
