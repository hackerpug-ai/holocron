# Contributing to Holocron

Thank you for your interest in contributing to Holocron! This document provides guidelines and workflows for contributing to this project.

## Getting Started

### Prerequisites

- **Node.js**: v20+ (LTS)
- **pnpm**: Latest stable version
- **Expo CLI**: For React Native development
- **Convex CLI**: For backend development

### Installation

```bash
# Install dependencies
pnpm install

# Set up Convex development environment
npx convex dev

# Start the development server
pnpm start
```

### Development Workflow

```bash
# Run the Expo development server
pnpm start

# Type check
pnpm tsc --noEmit

# Run tests
pnpm vitest run

# Run tests in watch mode
pnpm vitest
```

## Project Structure

```
holocron/
├── app/                    # Expo Router (file-based routing)
├── components/             # React Native components
│   ├── ui/                # Reusable UI primitives
│   └── forms/             # Form components
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions and configurations
├── convex/                 # Convex backend (schema, functions)
├── supabase/              # Supabase integration
└── assets/                # Images, fonts, and static assets
```

## Branch Strategy

- **`main`**: Production-ready code, always deployable
- **`feature/`**: New features and enhancements
- **`fix/`**: Bug fixes and patches
- **`refactor/`**: Code refactoring without functional changes
- **`docs/`**: Documentation updates

### Creating a Branch

```bash
# Start a new feature branch
git checkout -b feature/your-feature-name

# Or a fix branch
git checkout -b fix/bug-description
```

## Pull Request Process

### Before Opening a PR

1. **Update your branch**: `git pull origin main`
2. **Run quality checks**:
   ```bash
   # Type check
   pnpm tsc --noEmit
   
   # Run tests
   pnpm vitest run
   ```
3. **Format your code**: ESLint runs automatically via pre-commit hooks
4. **Write descriptive commit messages**: Use conventional commit format (`feat:`, `fix:`, `refactor:`, etc.)

### Opening a Pull Request

1. Push your branch to GitHub
2. Open a pull request against `main`
3. Fill in the PR template with:
   - Description of changes
   - Related issue numbers
   - Testing steps
   - Screenshots (for UI changes)

### Pre-commit Hooks

This project uses pre-commit hooks that enforce code quality:

1. **lint-staged**: Runs ESLint with auto-fix on staged TypeScript/JavaScript files
2. **tsc --noEmit**: Full project TypeScript type-check
3. **vitest run**: Full test suite execution

**All three gates must pass before a commit is allowed.** This is by design—do not bypass these checks.

## Code Style & Conventions

### TypeScript

- Use strict TypeScript configuration
- Define types for all function arguments and return values
- Avoid `any` types—use `unknown` when the type is truly unknown
- Prefer interfaces for object shapes, types for unions/intersections

### React Native

- **Text Component**: Always use `react-native-paper` Text, not `react-native` Text
  ```typescript
  import { Text } from 'react-native-paper'
  
  <Text variant="titleLarge">Title</Text>
  <Text variant="bodyMedium">Body text</Text>
  ```

- **Styling**: Use `StyleSheet.create()` for static layout, inline for dynamic theme values
  ```typescript
  import { StyleSheet } from 'react-native'
  import { useSemanticTheme } from '@/hooks/use-semantic-theme'
  
  export const Card = ({ title }) => {
    const { semantic } = useSemanticTheme()
    return (
      <View style={[
        styles.container,
        { backgroundColor: semantic.color.card.default }
      ]}>
        <Text variant="titleMedium">{title}</Text>
      </View>
    )
  }
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
  })
  ```

- **Test IDs**: Every interactive element must have a testID
  ```typescript
  <Button testID="login-submit-button" onPress={handleSubmit}>
  <Pressable testID="card-pressable">
  ```

### Hooks

- **useQuery/useMutation**: Always handle loading and error states
  ```typescript
  const data = useQuery(api.db.accounts.list, args)
  
  if (data.isLoading) return <LoadingSpinner />
  if (data.error) return <ErrorScreen error={data.error} />
  ```

- **Avoid useEffect syncing**: Never use local state + useEffect to sync query data
  ```typescript
  // ❌ BAD: State syncing with useEffect
  const [customers, setCustomers] = useState([])
  const queryResult = useQuery(api.db.accounts.list, args)
  useEffect(() => {
    if (data?.customers) setCustomers(data.customers)
  }, [data])
  
  // ✅ GOOD: Return data directly
  const customers = queryResult?.data?.customers ?? []
  ```

### Convex

- **Schema**: Define all database tables in `convex/schema.ts`
- **Functions**: Organize by domain in `convex/` directory
- **Validation**: Use `v` object for argument validation
  ```typescript
  import { v } from 'convex/values'
  
  export const myMutation = mutation({
    args: {
      title: v.string(),
      count: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
      // Implementation
    },
  })
  ```

### Theme & Styling

- **Never hardcode values**: Use semantic theme tokens
  ```typescript
  // ❌ BAD
  style={{ padding: 16, backgroundColor: '#FFFFFF' }}
  
  // ✅ GOOD
  style={{
    padding: semantic.space.lg,
    backgroundColor: semantic.color.surface.default,
  }}
  ```

- **Use Paper components**: For consistent styling and theming
  ```typescript
  import { Button, TextInput, Surface } from 'react-native-paper'
  ```

## Testing

### Component Tests

```bash
# Run all tests
pnpm vitest run

# Run in watch mode
pnpm vitest

# Run specific test file
pnpm vitest run components/ui/FeatureCard.test.tsx
```

### Test Structure

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native'

describe('FeatureCard', () => {
  it('renders title', () => {
    render(<FeatureCard title="Test" description="Desc" onPress={jest.fn()} />)
    expect(screen.getByText('Test')).toBeTruthy()
  })

  it('calls onPress', () => {
    const onPress = jest.fn()
    render(<FeatureCard title="Test" description="Desc" onPress={onPress} />)
    fireEvent.press(screen.getByTestId('feature-card-button'))
    expect(onPress).toHaveBeenCalled()
  })
})
```

## Deployment

This project uses EAS (Expo Application Services) for deployment. When you create a GitHub Release on `main`, it automatically triggers:

1. **Quality gates**: Type check and tests
2. **iOS build**: Builds and submits to App Store
3. **Android build**: Builds for Android

**Only deploy client code changes** (files in `app/`, `components/`, `hooks/`, `lib/`, `assets/`). Backend-only changes (`convex/`, `supabase/`) do not require a client deploy.

## Questions?

If you have questions or need clarification on any of these guidelines, please open an issue or discussion on GitHub.

---

**Happy contributing!** 🚀
