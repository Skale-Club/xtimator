'use server'

/**
 * Theme preference server action.
 *
 * NOTE: This file is a contract-compatible stub created by Plan 09-03 so that
 * Plan 09-03's ThemeToggle component compiles while Plan 09-01 ships in parallel.
 * Plan 09-01 will replace this with the full implementation that writes to
 * `companies.theme_preference` + sets the `eb-theme` cookie.
 *
 * Contract (must be preserved by 09-01):
 *   saveThemePreference(theme: 'dark' | 'light' | 'system')
 *     → Promise<{ ok: true } | { ok: false; message: string }>
 */

import { cookies } from 'next/headers'

const ALLOWED = ['dark', 'light', 'system'] as const
export type Theme = (typeof ALLOWED)[number]

export async function saveThemePreference(
  theme: Theme
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!ALLOWED.includes(theme)) {
    return { ok: false, message: 'invalid theme' }
  }

  try {
    const cookieStore = await cookies()
    cookieStore.set('eb-theme', theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return { ok: false, message }
  }
}
