# ATTENTION ALL REVIEWERS
- this is a personal app that will NEVER be published to the app store, our keys are the security, you don't need to worry about production hardening for RLS or multi tennant.

# Git Commit Policy
- Commit automatically whenever you complete a meaningful change (feature, fix, refactor, etc.) — don't wait to be asked.
- Write a descriptive commit message that explains **what** changed and **why**, not just "save" or "wip".
- Follow conventional commit format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, etc.

## Pre-commit Hooks (CRITICAL — ALL THREE MUST PASS)
Pre-commit hooks run three gates on every commit:
1. **`lint-staged`** — `eslint --fix` on staged `.ts/.tsx/.js/.jsx` files
2. **`tsc --noEmit`** — Full project TypeScript type-check
3. **`vitest run`** — Full test suite

If ANY gate fails, the commit is rejected. This is by design. **Do not work around it.**

## Agent Commit Discipline (Orchestrators & Subagents)

**Completing work without committing is a FAILURE, not a success.** A Claude Code `SubagentStop` hook enforces this — agents with uncommitted changes will be told to fix and commit before they can finish.

### The Contract
1. **You MUST commit your work.** Reporting "done" with uncommitted changes is not acceptable. The SubagentStop hook will catch this and send you back to fix it.
2. **Fix what the hooks catch.** If `tsc`, `eslint`, or `vitest` fail on commit, that is YOUR work to fix — not a reason to stop. Read the errors, fix them, commit again.
3. **Never skip hooks.** Do not use `--no-verify`. Ever. For any reason.
4. **Scope is flexible.** If fixing a hook failure requires touching files outside your immediate task, do it. If it's a large cleanup, spawn a subagent for it. Either way, get to a green commit.
5. **Commit early and often.** Each meaningful unit of work gets its own commit. Don't batch unrelated changes.
6. **Clean up what you touch.** If you edit a file with pre-existing lint/type errors, fix them. Leave every file better than you found it.
7. **Orchestrators: plan for commit success.** When scoping work for subagents, include "pass all hooks and commit" as an explicit requirement, not an afterthought.

# React & React Native Rules

This document consolidates all React and React Native development rules, patterns, and standards.

**Source of Truth**: `brain/docs/REACT-RULES.md`, `brain/docs/THEME-RULES.md`, `brain/docs/vite-rules/README.md`

---

## Quick Reference: Platform Differences

| Aspect | React Vite (Web) | React Native (Expo) |
|--------|------------------|---------------------|
| Routing | react-router-dom | React Navigation / Expo Router |
| Styling | CSS Modules | StyleSheet.create |
| Testing | @testing-library/react | @testing-library/react-native |
| HTML Elements | Semantic HTML (`<button>`, `<nav>`) | View/Text (no HTML) |
| Test Attribute | `data-testid` | `testID` |
| Text Component | Native HTML elements | `react-native-paper` Text |
| Config | vite.config.ts | app.json |
| Build | pnpm build | pnpm build / eas build |
| Dev Server | pnpm dev:client | pnpm start / Expo Go |

---

## Universal React Rules

### Hook Usage Guidelines

#### useCallback - AVOID Unless Necessary

`useCallback` creates more overhead than it prevents in most cases. Only use when:
1. Passing to `React.memo` components with expensive renders
2. Function is a dependency of `useEffect`, `useMemo`, or custom hooks

```typescript
// ❌ DON'T: Unnecessary useCallback
const handleClick = useCallback(() => {
  setCount(count + 1);
}, [count]);

// ✅ DO: Regular function
const handleClick = () => {
  setCount(count + 1);
};

// ✅ DO: When passing to React.memo component
const ExpensiveChild = React.memo(({ onClick }) => {
  // Expensive rendering logic
  return <div onClick={onClick}>Expensive Component</div>;
});

const Parent = () => {
  const handleClick = useCallback(() => {
    // logic that doesn't depend on frequently changing state
  }, []);

  return <ExpensiveChild onClick={handleClick} />;
};
```

#### useMemo - AVOID Unless Necessary

Only use for expensive calculations, not simple object creation.

```typescript
// ❌ DON'T: useMemo for simple object creation
const style = useMemo(() => ({ color: 'red' }), []);

// ✅ DO: Just create the object normally
const style = { color: 'red' };

// ✅ DO: Use for expensive calculations
const expensiveValue = useMemo(() => {
  return heavyComputation(data);
}, [data]);
```

#### useReducer - For Coordinated State Changes

Use when a single action causes multiple state changes.

```typescript
// ❌ SMELL: Multiple setState calls in handlers
const handlePageChange = (pageIndex: number) => {
  setCurrentPageIndex(pageIndex)
  setSelectedFieldId(null)
  setSheetVisible(false)
  setIsEditing(false)
}

// ✅ GOOD: Single action, atomic state change
const handlePageChange = (pageIndex: number) => {
  dispatch({ type: 'PAGE_CHANGED', pageIndex })
}

// Reducer handles all coordinated changes
case 'PAGE_CHANGED':
  return {
    ...state,
    currentPageIndex: action.pageIndex,
    selectedFieldId: null,
    sheetVisible: false,
    isEditing: false,
  }
```

#### Custom Hooks - Avoid State Syncing Anti-Pattern

**NEVER** use local state + useEffect to sync query data.

```typescript
// ❌ AVOID: State syncing with useEffect
export function useCustomers() {
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const queryResult = useQuery(api.db.accounts.list, args)

  useEffect(() => {
    if (data?.customers) {
      setAllCustomers(data.customers)  // Stale state bugs!
    }
  }, [data])

  return { customers: allCustomers }
}

// ✅ PREFER: Return data directly from query
export function useCustomers() {
  const queryResult = useQuery(api.db.accounts.list, args)
  const customers = queryResult?.data?.customers ?? []

  return {
    customers,
    loading: queryResult?.isLoading ?? false,
    error: queryResult?.error ?? null,
  }
}
```

### Import Guidelines

- Prefer **named exports** for better tree-shaking and refactoring
- **Exception**: Default exports for Expo Router / Next.js pages (required by framework)

```typescript
// ✅ DO: Named exports for components, hooks, utilities
export const MyComponent = () => <div>Hello</div>;

// ✅ DO: Default exports for Expo Router pages (app/ directory)
export default function HomeScreen() {
  return <View>...</View>;
}

// ❌ DON'T: Default exports for non-page components
export default function MyComponent() {
  return <div>Hello</div>;
}
```

### State Management

- Keep state **as close to where it's used** as possible
- **Local UI state** (form input, toggles, visibility): `useState`
- **Coordinated state** (multiple changes per action): `useReducer`
- **Shared data** (users, jobs, entities): Convex `useQuery`/`useMutation`
- **NO prop drilling** beyond 1 level (use Context for deeper nesting)

---

## Storybook Story Co-location

**RULE**: Every UI component MUST have a co-located story file.

### File Convention
- Component: `components/ui/foo.tsx`
- Story: `components/ui/foo.stories.tsx` (sibling, same directory)

### Required Story Structure
```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { ComponentName } from './component-name'

const meta = {
  title: 'UI/ComponentName',
  component: ComponentName,
} satisfies Meta<typeof ComponentName>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { /* minimal props */ },
}

// REQUIRED if component has variants
export const AllVariants: Story = {
  render: () => ( /* grid of all variants */ ),
}
```

### Interactive Components MUST Include Play Functions
```typescript
import { within, userEvent, expect } from '@storybook/test'

export const ClickToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('switch')
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
  },
}
```

---

## React Native Specific Rules

### Text Component - CRITICAL

**ALWAYS** use `react-native-paper` Text, **NEVER** `react-native` Text.

```typescript
// ✅ CORRECT: Paper Text component with variants
import { Text } from 'react-native-paper'

<Text variant="titleLarge">Title</Text>
<Text variant="bodyMedium">Body text</Text>
<Text variant="labelSmall">LABEL</Text>

// ❌ WRONG: React Native Text component
import { Text } from 'react-native'

<Text style={{ fontSize: 22 }}>Title</Text>
```

### Styling: StyleSheet + Array Syntax

Use `StyleSheet.create()` for static layout, inline for dynamic theme values.

```typescript
import { View, StyleSheet } from 'react-native'
import { Text } from 'react-native-paper'
import { useSemanticTheme } from '@/hooks/use-semantic-theme'

export const Card = ({ title, children }) => {
  const { semantic } = useSemanticTheme()

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: semantic.color.card.default,
        borderColor: semantic.color.border.default,
        borderRadius: semantic.radius.lg,
        padding: semantic.space.lg,
      }
    ]}>
      <Text variant="titleMedium" style={{ color: semantic.color.onSurface.default }}>
        {title}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    borderWidth: 1,
  },
})
```

### testID Requirements

**Every interactive element gets a `testID`.**

```typescript
<Button testID="feature-card-primary-button" onPress={onPress}>
<TextInput testID="email-input" />
<Pressable testID="card-pressable">

// Pattern: {screen}-{component}-{element}
// Example: "login-screen-email-input"
```

### Project Structure (Expo Router)

Expo Router uses **file-based routing** in the `app/` directory.

```
app/
├── _layout.tsx           # Root layout (navigation container, providers)
├── index.tsx             # Home screen (/)
├── +not-found.tsx        # 404 page
├── (tabs)/               # Tab group (grouped routes)
│   ├── _layout.tsx       # Tab navigator layout
│   ├── index.tsx         # First tab (default)
│   ├── explore.tsx       # Second tab
│   └── settings.tsx      # Third tab
├── (auth)/               # Auth group (shared layout)
│   ├── _layout.tsx       # Auth layout (e.g., no tabs)
│   ├── login.tsx         # /login
│   └── register.tsx      # /register
├── [id].tsx              # Dynamic route (/123, /abc)
├── user/
│   ├── _layout.tsx       # Nested layout
│   ├── index.tsx         # /user
│   └── [userId].tsx      # /user/123
components/               # Reusable components (outside app/)
├── ui/                   # UI primitives
│   └── FeatureCard.tsx
└── forms/                # Form components
    └── LoginForm.tsx
hooks/                    # Custom hooks (outside app/)
└── useFeature.ts
```

**Key Conventions:**
- `_layout.tsx` - Layout wrapper for route group
- `(groupName)/` - Route groups (URL not affected)
- `[param].tsx` - Dynamic segments
- `+not-found.tsx` - 404 handler
- Files in `app/` = routes (use default exports)
- Files outside `app/` = components (use named exports)

---

## React Vite (Web) Specific Rules

### Verify Vite Project First
```bash
# Check for Vite config
if [ -f "vite.config.ts" ] || [ -f "vite.config.js" ]; then
  # Vite patterns apply
fi
```

### Routing: react-router-dom

```typescript
import { Link, useNavigate } from 'react-router-dom'

// Declarative navigation
<Link to="/dashboard">Dashboard</Link>

// Programmatic navigation
const navigate = useNavigate()
<button onClick={() => navigate('/dashboard')}>Go</button>
```

### Styling: CSS Modules

```typescript
// Component.tsx
import styles from './Component.module.css'

export const Component = () => (
  <div className={styles.container}>
    <h1 className={styles.title}>Title</h1>
  </div>
)
```

```css
/* Component.module.css */
.container {
  display: flex;
  flex-direction: column;
}
```

### Semantic HTML - REQUIRED

```typescript
// ❌ BAD: Div soup
<div className="header">
  <div className="title">Title</div>
  <div className="button">Click</div>
</div>

// ✅ GOOD: Semantic HTML
<header className="container">
  <h1>Title</h1>
  <button>Click</button>
</header>
```

Common semantic elements: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`, `<button>`, `<input>`, `<form>`

### data-testid Requirements

**Every interactive element gets a `data-testid`.**

```typescript
<button data-testid="feature-card-primary-button" onClick={onPress}>
<input data-testid="email-input" />
<div data-testid="card-pressable" role="button">

// Pattern: {screen}-{component}-{element}
```

**Note**: Web uses `data-testid`, NOT `testID` (React Native)

### Project Structure
```
src/
├── components/     # Reusable React components
│   ├── FeatureCard.tsx
│   └── FeatureCard.module.css
├── pages/          # Route pages
│   └── login.tsx
├── routes/         # Route definitions
│   └── index.tsx
├── hooks/          # Custom React hooks
│   └── useFeature.ts
├── App.tsx         # Root component
└── main.tsx        # Entry point
tests/
└── components/     # Component tests
    └── FeatureCard.test.tsx
```

---

## Theme Rules - Semantic Tokens

### NEVER Hardcode Values

```typescript
// ❌ BAD
style={{ padding: 16, backgroundColor: '#FFFFFF' }}

// ✅ GOOD
style={{
  padding: semantic.space.md,
  backgroundColor: semantic.color.surface.default,
  borderRadius: semantic.radius.lg,
}}
```

### Theme Structure

```typescript
theme.semantic = {
  color: {
    // Brand colors with states
    primary: { default, hover, pressed, disabled, focus }
    secondary: { default, hover, pressed, disabled, focus }
    tertiary: { default, hover, pressed, disabled, focus }

    // Intent colors
    success: { default, hover, pressed, disabled }
    warning: { default, hover, pressed, disabled }
    danger: { default, hover, pressed, disabled }
    info: { default, hover, pressed, disabled }

    // Surface layers
    surface: { default, hover, pressed, disabled }
    background: { default, hover, pressed, disabled }

    // Text colors
    onSurface: { default, hover, pressed, disabled, muted, subtle }
    onPrimary: { default, hover, pressed, disabled }

    // UI elements
    border: { default, hover, pressed, disabled }
    card: { default, hover, pressed, disabled }
  },

  space: { xs, sm, md, lg, xl, '2xl', '3xl', '4xl' },
  radius: { none, sm, md, lg, xl, '2xl', full },

  type: {
    label: { sm, md, lg },
    body: { sm, md, lg },
    title: { sm, md, lg },
    heading: { sm, md, lg },
    display: { sm, md, lg }
  },

  elevation: { 0, 1, 2, 3, 4, 5 }
}
```

### Spacing Scale Reference

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tiny gaps |
| `sm` | 8px | Small gaps |
| `md` | 12px | Medium gaps |
| `lg` | 16px | Standard padding |
| `xl` | 24px | Large padding |
| `2xl` | 32px | Extra large padding |
| `3xl` | 48px | Section spacing |
| `4xl` | 64px | Major section spacing |

### Interactive States

```typescript
<Pressable onPress={onPress} disabled={disabled}>
  {({ pressed }) => (
    <View style={{
      backgroundColor: disabled
        ? semantic.color.primary.disabled
        : pressed
        ? semantic.color.primary.pressed
        : semantic.color.primary.default,
    }}>
      <Text>Press Me</Text>
    </View>
  )}
</Pressable>
```

---

## Validation Gates (ALL BLOCKING)

### 6 Universal Production Quality Gates

#### Gate 1: Component File Organization
- File name matches exported component name
- Single component per file (except index.tsx for re-exports)
- Located in correct directory
- NO commented-out code blocks

#### Gate 2: Hook Patterns
- useQuery/useMutation handle loading/error states
- Custom hooks follow `use*` naming convention
- useEffect has complete dependency array
- NO conditional hook calls

#### Gate 3: Component Props Validation
- All props are TypeScript types (no PropTypes)
- NO `any` types in props interface
- Optional props marked with `?`
- Event handlers follow `on{Event}` naming

#### Gate 4: State Management Pattern
- Local UI state: ONLY useState
- Shared data: ONLY Convex useQuery/useMutation
- NO prop drilling beyond 1 level

#### Gate 5: Import Completeness
- All imported modules exist
- NO circular dependencies
- Import order: React/external → local → types

#### Gate 6: Accessibility Standards
- Form inputs have associated labels
- Images have alt text
- Interactive elements are keyboard accessible
- Semantic HTML used (not `<div onClick>`)

---

## Mandatory Verification Commands

```bash
# 1. Type check (always)
pnpm tsc --noEmit

# 2. App startup (for UI changes)
pnpm dev  # Must start without errors

# 3. Storybook tests (for DESIGN tasks)
vitest --project=storybook --run

# 4. Build verification
pnpm build  # Must pass with zero warnings
```

**Exit Code 0 = Pass. ANY error = Task REJECTED.**

---

## Theme Validation Checklist

Before committing component code:

- [ ] **Text component is from Paper** (React Native only): `import { Text } from 'react-native-paper'`
- [ ] **Text uses Paper variants**: `variant="titleLarge"`, `variant="bodyMedium"`, etc.
- [ ] **NEVER hardcode colors** — no hex (`#6750A4`), no `rgba()`, no color strings in inline styles or Animated.View styles. Use `className` with Tailwind tokens (`text-primary`, `bg-muted`, `border-border`) or `useTheme()` colors (`themeColors.primary`) for dynamic/animated styles. This includes highlight colors, active states, borders, and backgrounds.
- [ ] No hardcoded spacing values (`16`, `24`, `padding: 8`, etc.)
- [ ] No hardcoded typography (`fontSize: 16`, `fontWeight: '500'`, etc.)
- [ ] All colors use `semantic.color.*`
- [ ] All spacing uses `semantic.space.*`
- [ ] All typography uses `semantic.type.*` (when Paper variant unavailable)
- [ ] All border radius uses `semantic.radius.*`
- [ ] Interactive states use appropriate state colors
- [ ] Component works in both light and dark modes

---

## Testing

### React Vite (Web)
```typescript
import { render, screen, fireEvent } from '@testing-library/react'

describe('FeatureCard', () => {
  it('renders title', () => {
    render(<FeatureCard title="Test" description="Desc" onPress={jest.fn()} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('calls onPress', () => {
    const onPress = jest.fn()
    render(<FeatureCard title="Test" description="Desc" onPress={onPress} />)
    fireEvent.click(screen.getByTestId('feature-card-button'))
    expect(onPress).toHaveBeenCalled()
  })
})
```

### React Native
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

---

## References

- `brain/docs/REACT-RULES.md` - React patterns, hooks
- `brain/docs/THEME-RULES.md` - Semantic theme system
- `brain/docs/vite-rules/README.md` - Vite-specific patterns
- `brain/skills/react-validation-gates/SKILL.md` - Validation gates
- `brain/skills/react-native-implement/SKILL.md` - React Native implementation
- `brain/skills/react-native-review/SKILL.md` - React Native review
- `brain/skills/react-vite-implement/SKILL.md` - React Vite implementation
