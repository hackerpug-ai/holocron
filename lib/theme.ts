/**
 * Theme tokens for holocron
 *
 * Vibe: elegant, minimal
 *
 * These tokens are derived from the CSS variables in global.css
 * and can be used for programmatic access to theme values.
 */

// Color tokens - HSL values from global.css
export const colors = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(222.2 84% 4.9%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(222.2 84% 4.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(222.2 84% 4.9%)',
    primary: 'hsl(222.2 47.4% 11.2%)',
    primaryForeground: 'hsl(210 40% 98%)',
    secondary: 'hsl(210 40% 96.1%)',
    secondaryForeground: 'hsl(222.2 47.4% 11.2%)',
    muted: 'hsl(210 40% 96.1%)',
    mutedForeground: 'hsl(215.4 16.3% 46.9%)',
    accent: 'hsl(210 40% 96.1%)',
    accentForeground: 'hsl(222.2 47.4% 11.2%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    border: 'hsl(214.3 31.8% 91.4%)',
    input: 'hsl(214.3 31.8% 91.4%)',
    ring: 'hsl(222.2 84% 4.9%)',
  },
  dark: {
    background: 'hsl(222.2 84% 4.9%)',
    foreground: 'hsl(210 40% 98%)',
    card: 'hsl(222.2 84% 4.9%)',
    cardForeground: 'hsl(210 40% 98%)',
    popover: 'hsl(222.2 84% 4.9%)',
    popoverForeground: 'hsl(210 40% 98%)',
    primary: 'hsl(210 40% 98%)',
    primaryForeground: 'hsl(222.2 47.4% 11.2%)',
    secondary: 'hsl(217.2 32.6% 17.5%)',
    secondaryForeground: 'hsl(210 40% 98%)',
    muted: 'hsl(217.2 32.6% 17.5%)',
    mutedForeground: 'hsl(215 20.2% 65.1%)',
    accent: 'hsl(217.2 32.6% 17.5%)',
    accentForeground: 'hsl(210 40% 98%)',
    destructive: 'hsl(0 62.8% 30.6%)',
    destructiveForeground: 'hsl(210 40% 98%)',
    border: 'hsl(217.2 32.6% 17.5%)',
    input: 'hsl(217.2 32.6% 17.5%)',
    ring: 'hsl(212.7 26.8% 83.9%)',
  },
}

// Spacing scale (in pixels)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
}

// Border radius tokens
export const radius = {
  none: 0,
  sm: 4,   // calc(var(--radius) - 4px)
  md: 6,   // calc(var(--radius) - 2px)
  lg: 8,   // var(--radius)
  xl: 12,
  '2xl': 16,
  full: 9999,
}

// Typography scale
export const typography = {
  display: { fontSize: 36, fontWeight: '700' as const, lineHeight: 1.1 },
  h1: { fontSize: 30, fontWeight: '700' as const, lineHeight: 1.2 },
  h2: { fontSize: 24, fontWeight: '600' as const, lineHeight: 1.3 },
  h3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 1.4 },
  h4: { fontSize: 18, fontWeight: '600' as const, lineHeight: 1.4 },
  bodyLarge: { fontSize: 18, fontWeight: '400' as const, lineHeight: 1.6 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 1.6 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 1.5 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 1.4 },
  label: { fontSize: 11, fontWeight: '600' as const, lineHeight: 1.2, textTransform: 'uppercase' as const },
}

// Export combined theme
export const theme = {
  colors,
  spacing,
  radius,
  typography,
}

export type Theme = typeof theme
