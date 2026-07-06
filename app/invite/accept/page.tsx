import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/lib/actions/invite-accept'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

/**
 * SEAT-04 — the /invite/accept route the Phase-136 invite email links to.
 *
 * This route is the JOIN authority and the SEAT-04 "branch": it lives OUTSIDE the
 * (app) group, so the onboarding guard (getActiveCompany() == null → /onboarding)
 * never fires here. An invited NEW user therefore reaches accept (JOIN the existing
 * company via acceptInvite) instead of /onboarding (CREATE a new company). The
 * create-company path is skipped purely by routing — company.ts is untouched.
 *
 * Two visitor states:
 *   A. Unauthenticated → routed to /?auth=signup carrying the token in `next`, so
 *      after signUp/signIn the user is returned here and the accept runs.
 *   B. Authenticated   → acceptInvite(token) runs; on success → /dashboard (the
 *      action already switched the active company), on error a clear card renders.
 *
 * The raw token is a secret: it is NEVER logged and never shown except inside the
 * resume link itself.
 *
 * Next.js 16: `searchParams` is a Promise — await before destructure.
 */
export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <AcceptCard message="This invite link is missing its token." />
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  // Branch A — UNAUTHENTICATED: route to signup carrying the token so it survives
  // the auth round-trip. Signup-first (most invitees are new); the dialog lets an
  // existing user switch to login, which carries the same `next`. Never /onboarding.
  if (!claims?.sub) {
    const resumeUrl = `/invite/accept?token=${encodeURIComponent(token)}`
    redirect(`/?auth=signup&next=${encodeURIComponent(resumeUrl)}`)
  }

  // Branch B — AUTHENTICATED: run the token-authority join.
  const result = await acceptInvite(token)

  if ('success' in result) {
    // acceptInvite already switched the active company → land in the app.
    redirect('/dashboard')
  }

  // Error path — render the message, never create a company, never go to /onboarding.
  return <AcceptCard message={result.error} isError />
}

function AcceptCard({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/60 p-8 text-center shadow-sm backdrop-blur">
        <h1 className="text-lg font-semibold text-foreground">
          {isError ? "We couldn't accept this invite" : 'Invite link'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}
