import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBranding } from '@/lib/platform-config'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (data?.claims) {
    redirect('/dashboard')
  }

  const branding = await getBranding()

  return <LoginForm appName={branding.appName} logoUrl={branding.logoUrl} />
}
