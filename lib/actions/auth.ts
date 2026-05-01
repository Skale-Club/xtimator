'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logAuthEvent } from '@/lib/auth-logger'

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    logAuthEvent({ event: 'sign_up_attempt', success: false, email, error: error.message })
    if (error.message.includes('already registered')) {
      return { error: 'An account with this email already exists. Sign in instead.' }
    }
    return { error: 'Something went wrong. Please try again.' }
  }

  // New user → onboarding (no company record yet)
  logAuthEvent({ event: 'sign_up_attempt', success: true, email })
  redirect('/onboarding')
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

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

  // Check if company exists → redirect accordingly (AUTH-06)
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (claims) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()
    logAuthEvent({ event: 'sign_in_attempt', success: true, email, userId: claims.sub })
    redirect(company ? '/dashboard' : '/onboarding')
  }

  logAuthEvent({ event: 'sign_in_attempt', success: false, email, error: 'claims_unavailable_after_sign_in' })
  redirect('/login')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  logAuthEvent({ event: 'sign_out', success: true })
  redirect('/login')
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:9633'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/callback?type=recovery`,
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
  redirect('/dashboard')
}
