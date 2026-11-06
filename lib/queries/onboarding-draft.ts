import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { OnboardingDraft } from '@/lib/onboarding/draft'

export async function getOrCreateOnboardingDraft(mode: 'first' | 'add'): Promise<OnboardingDraft> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) throw new Error('Not authenticated')
  const find = () => supabase.from('onboarding_drafts').select('id,mode,step,values,last_activity_at,revision')
    .eq('user_id', userId).eq('mode', mode).is('completed_at', null).maybeSingle()
  const existing = await find()
  if (existing.error) throw new Error('Onboarding draft unavailable')
  if (existing.data) return existing.data as OnboardingDraft
  const inserted = await supabase.from('onboarding_drafts').insert({ user_id: userId, mode })
    .select('id,mode,step,values,last_activity_at,revision').single()
  if (!inserted.error) return inserted.data as OnboardingDraft
  if (inserted.error.code === '23505') {
    const raced = await find()
    if (!raced.error && raced.data) return raced.data as OnboardingDraft
  }
  throw new Error('Onboarding draft unavailable')
}
