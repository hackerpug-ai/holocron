/**
 * Theme tokens for holocron
 *
 * Vibe: elegant, minimal
 *
 * These tokens are derived from the CSS variables in global.css
 * and converted to hex format for React Native compatibility.
 */

// Color tokens - Hex values (converted from HSL in global.css)
export const colors = {
  light: {
    background: '#FFFFFF',
    foreground: '#020817',
    inverse: '#F8FAFC', // Opposite of foreground for code blocks
    card: '#FFFFFF',
    cardForeground: '#020817',
    popover: '#FFFFFF',
    popoverForeground: '#020817',
    primary: '#0F172A',
    primaryForeground: '#F8FAFC',
    secondary: '#F1F5F9',
    secondaryForeground: '#0F172A',
    muted: '#F1F5F9',
    mutedForeground: '#64748B',
    accent: '#F1F5F9',
    accentForeground: '#0F172A',
    destructive: '#EF4444',
    destructiveForeground: '#F8FAFC',
    border: '#E2E8F0',
    input: '#E2E8F0',
    ring: '#020817',
    // ArticleDetail specific colors
    indicator: '#D9D9D9',
    closeBtn: '#F1F5F9',
    // Markdown link colors
    link: '#3B82F6',
    // Markdown code block colors
    codeInline: '#020817',
    codeInlineBg: '#F5F5F5',
    codeBlockBg: '#1E293B',
    codeBlockForeground: '#F8FAFC', // Light text for dark code blocks
    blockquote: '#64748B',
    tableHeader: '#0D0D0D',
    tableBody: '#535353',
  },
  dark: {
    background: '#020817',
    foreground: '#F8FAFC',
    inverse: '#020817', // Opposite of foreground for code blocks
    card: '#020817',
    cardForeground: '#F8FAFC',
    popover: '#020817',
    popoverForeground: '#F8FAFC',
    primary: '#F8FAFC',
    primaryForeground: '#0F172A',
    secondary: '#1E293B',
    secondaryForeground: '#F8FAFC',
    muted: '#1E293B',
    mutedForeground: '#94A3B8',
    accent: '#1E293B',
    accentForeground: '#F8FAFC',
    destructive: '#7F1D1D',
    destructiveForeground: '#F8FAFC',
    border: '#1E293B',
    input: '#1E293B',
    ring: '#CBD5E1',
    // ArticleDetail specific colors
    indicator: '#334155',
    closeBtn: '#27364B',
    // Markdown link colors
    link: '#7DD3FC',
    // Markdown code block colors
    codeInline: '#F8FAFC',
    codeInlineBg: '#1E293B',
    codeBlockBg: '#1E1E1E',
    codeBlockForeground: '#F8FAFC', // Light text for dark code blocks
    blockquote: '#94A3B8',
    tableHeader: '#F8FAFC',
    tableBody: '#CBD5E1',
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
