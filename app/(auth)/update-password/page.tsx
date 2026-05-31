import { redirect } from 'next/navigation'
import { getBranding } from '@/lib/platform-config'
import { createClient } from '@/lib/supabase/server'
import { AuthCard } from '@/components/auth/auth-card'
import { UpdatePasswordForm } from './update-password-form'

export default async function UpdatePasswordPage() {
  // After Supabase exchanges the recovery code in /callback, the user has a session.
  // Guard here as a defensive fallback — if claims are missing, send to landing.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) {
    redirect('/?auth=login')
  }

  const branding = await getBranding()
  return (
    <AuthCard branding={branding}>
      <UpdatePasswordForm />
    </AuthCard>
  )
}
