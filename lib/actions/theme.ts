'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { writeThemeCookie, isValidTheme, type ThemePreference } from '@/lib/theme/cookie'
import { assertWritable } from '@/lib/demo/guard'

type ActionResult = { ok: true } | { ok: false; message: string }

export async function saveThemePreference(theme: ThemePreference): Promise<ActionResult> {
  if (!isValidTheme(theme)) {
    return { ok: false, message: 'Invalid theme preference' }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (!claims) return { ok: false, message: 'Not authenticated' }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { ok: false, message: 'No company found' }

  const denied = await assertWritable()
  if (denied) return { ok: false, message: denied.error }

  const { error } = await supabase
    .from('companies')
    .update({ theme_preference: theme })
    .eq('id', activeCompanyId)

  if (error) return { ok: false, message: error.message }

  await writeThemeCookie(theme)
  return { ok: true }
}
