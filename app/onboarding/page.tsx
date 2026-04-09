import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/auth/sign-out-button'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  if (!claims) {
    redirect('/auth/login')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Welcome! Let&apos;s set up your company.</h1>
      <p className="text-muted-foreground">Phase 2 will build this wizard.</p>
      <SignOutButton />
    </div>
  )
}
