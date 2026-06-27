'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logAuthEvent } from '@/lib/auth-logger'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'

/**
 * SEAT-04 open-redirect guard. The invite flow threads a `next` formData field so
 * an invited user resumes /invite/accept after auth (signup-then-join). To prevent
 * an open redirect we ONLY honor a relative `/invite/accept...` path — anything
 * else (absolute/external URL, any other path) is rejected and the caller falls
 * back to its existing destination.
 */
function safeInviteNext(next: string | null): string | null {
  return next && next.startsWith('/invite/accept') ? next : null
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const captchaToken = formData.get('captchaToken') as string | null
  const next = formData.get('next') as string | null

  // Optional account-creation step two fields. Stored on the auth user's
  // metadata so they survive the redirect into onboarding, which prefills from
  // them. The company row itself is still created at the end of onboarding, so
  // the "company exists = onboarding complete" guard stays valid.
  const companyName = (formData.get('companyName') as string | null) || undefined
  const subdomain = (formData.get('subdomain') as string | null) || undefined

  const userMetadata: Record<string, string> = {}
  if (companyName) userMetadata.company_name = companyName
  if (subdomain) userMetadata.subdomain = subdomain.toLowerCase()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(captchaToken ? { captchaToken } : {}),
      ...(Object.keys(userMetadata).length > 0 ? { data: userMetadata } : {}),
    },
  })

  if (error) {
    logAuthEvent({ event: 'sign_up_attempt', success: false, email, error: error.message })
    if (error.message.includes('already registered')) {
      return { error: 'An account with this email already exists. Sign in instead.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  logAuthEvent({ event: 'sign_up_attempt', success: true, email })

  // SEAT-04 branch: an invited new user carries `next=/invite/accept?token=...`.
  // Honor it so they JOIN the existing company via the accept route and NEVER hit
  // /onboarding (which CREATEs a company). Non-invited signups keep going to
  // /onboarding unchanged (no company record yet).
  const inviteNext = safeInviteNext(next)
  if (inviteNext) {
    redirect(inviteNext)
  }
  redirect('/onboarding')
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const captchaToken = formData.get('captchaToken') as string | null
  const next = formData.get('next') as string | null

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })

  if (error) {
    logAuthEvent({ event: 'sign_in_attempt', success: false, email, error: error.message })
    if (error.message.includes('Invalid login credentials') || error.message.includes('invalid_credentials')) {
      return { error: 'Incorrect email or password. Please try again.' }
    }
    if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
      return { error: 'Please check your inbox to confirm your email before signing in.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  // SEAT-04 branch: an invited existing user carries `next=/invite/accept?token=...`.
  // Resume the accept route so they JOIN the inviting company, regardless of whether
  // they already own a company of their own.
  const inviteNext = safeInviteNext(next)
  if (inviteNext) {
    logAuthEvent({ event: 'sign_in_attempt', success: true, email })
    redirect(inviteNext)
  }

  // Use the user returned directly from signInWithPassword() — it has the claims
  // we need (sub, email, etc.) without a race condition against getClaims().
  // getClaims() may not see the freshly-written session cookie on the first request.
  const user = data?.user ?? null
  if (user) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single()
    logAuthEvent({ event: 'sign_in_attempt', success: true, email, userId: user.id })
    redirect(company ? '/dashboard' : '/onboarding')
  }

  logAuthEvent({ event: 'sign_in_attempt', success: false, email, error: 'user_unavailable_after_sign_in' })
  redirect('/?auth=login')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  logAuthEvent({ event: 'sign_out', success: true })
  redirect('/')
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const captchaToken = formData.get('captchaToken') as string | null
  const origin = getCanonicalBaseUrl()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/callback?type=recovery`,
    ...(captchaToken ? { captchaToken } : {}),
  })

  if (error) {
    logAuthEvent({ event: 'password_reset_request', success: false, email, error: error.message })
    return { error: 'Something went wrong. Please try again.' }
  }

  logAuthEvent({ event: 'password_reset_request', success: true, email })
  return { success: `Check your inbox — we've sent a reset link to ${email}.` }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    logAuthEvent({ event: 'password_update', success: false, error: error.message })
    if (error.message.includes('expired') || error.message.includes('invalid')) {
      return { error: 'This reset link has expired. Request a new one.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  logAuthEvent({ event: 'password_update', success: true })

  // S02 remediation: a password change is the canonical response to account
  // compromise — revoke every OTHER session so a hijacked device is kicked out.
  // scope:'others' preserves the current session so the redirect below works
  // without forcing the legitimate user to sign in again.
  await supabase.auth.signOut({ scope: 'others' })

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (claims) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()
    redirect(company ? '/dashboard' : '/onboarding')
  }

  redirect('/?auth=login')
}
