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
    // Intent/status colors (for icons and indicators)
    success: '#10B981',
    warning: '#F59E0B',
    // danger = destructive in CSS/Tailwind
    danger: '#EF4444',
    info: '#8B5CF6',
    starRating: '#F59E0B',
    successForeground: '#FFFFFF',
    warningForeground: '#000000',
    infoForeground: '#FFFFFF',
    shadow: '#000000',
    overlay: '#000000',
    // Score scale (coverage ratings 1-5)
    score1: '#EF4444',
    score2: '#F97316',
    score3: '#FACC15',
    score4: '#22C55E',
    score5: '#10B981',
    scoreNeutral: '#94A3B8',
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
    // "Crystalline Archive" theme - Holocron knowledge repository aesthetic
    // Deep blue-black backgrounds with amber/gold accents and teal links
    background: '#0A0E14', // Deep navy-black base canvas
    foreground: '#E8E4DE', // Warm cream text (easier on eyes)
    inverse: '#0A0E14', // Opposite of foreground for code blocks
    card: '#111820', // Elevated navy surface
    cardForeground: '#E8E4DE',
    popover: '#151C26', // Modal/dropdown surface
    popoverForeground: '#E8E4DE',
    primary: '#F5A623', // Amber/gold glow - key actions
    primaryForeground: '#0A0E14', // Dark text on primary
    secondary: '#1A2332', // Secondary navy surface
    secondaryForeground: '#C9D1DD', // Light text on secondary
    muted: '#1E2A3B', // Subtle/disabled areas
    mutedForeground: '#8B9AAF', // Muted text
    accent: '#1A3A4A', // Accent surface (teal-tinted)
    accentForeground: '#4FD1C5', // Teal accent text
    destructive: '#EF4444', // Error/danger
    destructiveForeground: '#FFFFFF',
    border: '#1E2A3B', // Default borders
    input: '#151C26', // Input backgrounds
    ring: '#F5A623', // Focus rings (amber glow)
    // ArticleDetail specific colors
    indicator: '#2D3A4D', // Scroll indicators
    closeBtn: '#1A2332', // Close button backgrounds
    // Intent/status colors (for icons and indicators)
    success: '#34D399', // Emerald-300 (brighter for dark bg)
    warning: '#FBBF24', // Amber-300
    // danger = destructive in CSS/Tailwind
    danger: '#F87171', // Red-400
    info: '#A78BFA', // Violet-400
    starRating: '#FBBF24', // Amber-300
    successForeground: '#0A0E14',
    warningForeground: '#0A0E14',
    infoForeground: '#0A0E14',
    shadow: '#000000',
    overlay: '#000000',
    // Score scale (coverage ratings 1-5)
    score1: '#DC2626',
    score2: '#EA580C',
    score3: '#EAB308',
    score4: '#16A34A',
    score5: '#059669',
    scoreNeutral: '#64748B',
    // Markdown link colors
    link: '#4FD1C5', // Teal cyan links
    // Markdown code block colors
    codeInline: '#E8E4DE',
    codeInlineBg: '#1E2A3B',
    codeBlockBg: '#0D1117', // Rich dark code blocks
    codeBlockForeground: '#E6EDF3', // Code text
    blockquote: '#8B9AAF',
    tableHeader: '#E8E4DE',
    tableBody: '#C9D1DD',
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
