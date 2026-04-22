'use server'

import { createClient } from '@/lib/supabase/server'
import { writeThemeCookie, isValidTheme, type ThemePreference } from '@/lib/theme/cookie'

type ActionResult = { ok: true } | { ok: false; message: string }

export async function saveThemePreference(theme: ThemePreference): Promise<ActionResult> {
  if (!isValidTheme(theme)) {
    return { ok: false, message: 'Invalid theme preference' }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (!claims) return { ok: false, message: 'Not authenticated' }

  const { error } = await supabase
    .from('companies')
    .update({ theme_preference: theme })
    .eq('user_id', claims.sub)

  if (error) return { ok: false, message: error.message }

  await writeThemeCookie(theme)
  return { ok: true }
}
