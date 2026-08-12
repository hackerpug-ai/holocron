# UI Component Library

This project uses **React Native Reusables** as its component library, built on top of **NativeWind** (TailwindCSS for React Native).

## Overview

React Native Reusables brings the shadcn/ui philosophy to React Native:
- **Copy-paste components**: Components are copied into your codebase, not installed as a dependency
- **Full ownership**: Modify components to fit your needs
- **Accessibility first**: Built on Radix UI primitives
- **Consistent styling**: Uses TailwindCSS via NativeWind

## Directory Structure

```
components/
├── ui/                    # UI primitives from React Native Reusables
│   ├── text.tsx          # Base text component
│   ├── button.tsx        # Button variants
│   └── ...               # Add more components via CLI
└── CLAUDE.md             # This file
```

## Adding Components

Use the React Native Reusables CLI to add new components:

```bash
# Add a single component
pnpm dlx @react-native-reusables/cli@latest add button

# Add multiple components
pnpm dlx @react-native-reusables/cli@latest add card dialog

# Add all components
pnpm dlx @react-native-reusables/cli@latest add --all
```

## Using Components

```tsx
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export default function MyScreen() {
  return (
    <Button onPress={() => console.log('Pressed!')}>
      <Text>Click me</Text>
    </Button>
  )
}
```

## Styling with NativeWind

Components use TailwindCSS classes via NativeWind:

```tsx
import { View } from 'react-native'
import { Text } from '@/components/ui/text'

export default function Example() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-2xl font-bold text-primary">
        Hello World
      </Text>
    </View>
  )
}
```

## Theme Customization

### CSS Variables

Theme colors are defined in `global.css` using CSS variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

### Tailwind Config

Extend colors and other tokens in `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      // Add custom colors here
    },
  },
}
```

## The `cn` Utility

Use `cn()` from `@/lib/utils` to conditionally merge Tailwind classes:

```tsx
import { cn } from '@/lib/utils'

interface CardProps {
  className?: string
  isActive?: boolean
}

function Card({ className, isActive }: CardProps) {
  return (
    <View
      className={cn(
        'rounded-lg border bg-card p-4',
        isActive && 'border-primary',
        className
      )}
    />
  )
}
```

## Key Files

| File | Purpose |
|------|---------|
| `global.css` | Tailwind directives and CSS variables |
| `tailwind.config.js` | Tailwind/NativeWind configuration |
| `metro.config.js` | Metro bundler config for NativeWind |
| `babel.config.js` | Babel config with NativeWind preset |
| `components.json` | React Native Reusables CLI config |
| `lib/utils.ts` | `cn()` utility for class merging |
| `nativewind-env.d.ts` | TypeScript declarations for className prop |

## Best Practices

1. **Always use `cn()` for className props** - Enables proper class merging
2. **Use semantic color tokens** - `text-foreground`, `bg-background`, etc.
3. **Import Text from ui/text.tsx** - Ensures consistent styling
4. **Keep components in ui/ directory** - Easy to update via CLI
5. **Don't modify core primitives** - Create wrappers instead

## Lucide Icons

Icons are provided by `lucide-react-native`:

```tsx
import { Check, X, ChevronRight } from 'lucide-react-native'

<Check className="h-4 w-4 text-primary" />
```

## Troubleshooting

### Styles not applying?
1. Restart Metro: `pnpm start --clear`
2. Check `className` is on a valid element
3. Ensure `global.css` is imported in `_layout.tsx`

### TypeScript errors for className?
Ensure `nativewind-env.d.ts` is included in `tsconfig.json`.

## Resources

- [React Native Reusables Docs](https://reactnativereusables.com/docs)
- [NativeWind Docs](https://nativewind.dev)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/icons)
