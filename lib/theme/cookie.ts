import { cookies } from 'next/headers'

export const THEME_COOKIE_NAME = 'eb-theme'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export type ThemePreference = 'dark' | 'light' | 'system'

const VALID: readonly ThemePreference[] = ['dark', 'light', 'system'] as const

export function isValidTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value)
}

export async function readThemeCookie(): Promise<ThemePreference | null> {
  const store = await cookies()
  const raw = store.get(THEME_COOKIE_NAME)?.value
  return isValidTheme(raw) ? raw : null
}

export async function writeThemeCookie(theme: ThemePreference): Promise<void> {
  if (!isValidTheme(theme)) throw new Error(`Invalid theme: ${theme}`)
  const store = await cookies()
  store.set(THEME_COOKIE_NAME, theme, {
    path: '/',
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false, // next-themes reads cookie via document.cookie on first render
  })
}
