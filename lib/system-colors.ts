/**
 * `primary` is the default company BRAND color (estimate documents, PDFs, onboarding) and stays
 * #406EF1. `primaryHsl` is the app UI fill token, a little darker (57% vs 60%) so white text on it
 * meets WCAG AA (2026-11-27); see --system-primary in app/globals.css.
 */
export const SYSTEM_COLORS = {
  primary: '#406EF1',
  secondary: '#7FA4F4',
  primaryHsl: '224 86% 57%',
  secondaryHsl: '221 84% 73%',
} as const
