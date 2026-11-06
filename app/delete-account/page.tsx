import type { Metadata } from 'next'
import Link from 'next/link'
import { getBranding } from '@/lib/platform-config'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { SiteShell } from '@/components/site/site-shell'
import { DeleteAccountPanel } from '@/components/account/delete-account-panel'

// Public page (Google Play's account-deletion web resource). It reads the
// session cookie, so it always renders per request.
export const dynamic = 'force-dynamic'

const SUPPORT_EMAIL = 'support@xtimator.com'

export const metadata: Metadata = {
  title: 'Delete your account',
  description: 'How to delete your Xtimator account and the data associated with it.',
}

export default async function DeleteAccountPage() {
  const [branding, claims] = await Promise.all([getBranding(), getAuthClaims()])
  const appName = branding.appName

  let accountLabel: string | null = null
  if (claims) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    accountLabel = user?.email || user?.phone || 'your account'
  }

  return (
    <SiteShell branding={{ appName, logoUrl: branding.logoUrl }}>
      <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
        <article className="space-y-8">
          <header>
            <h1 className="mb-4 text-[clamp(36px,6vw,56px)] font-semibold leading-[1.05] tracking-[-0.025em]">
              Delete your {appName} account
            </h1>
            <p className="text-muted-foreground">
              You can delete your account and its data at any time, from the web or from the{' '}
              {appName} Android app.
            </p>
          </header>

          <Card variant="glass" className="space-y-4 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">What gets deleted</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Your login, profile, phone number and email address.</li>
              <li>
                Every company you own, with its clients, projects, estimates, signatures, audio
                recordings, transcripts, photos, price book and settings.
              </li>
              <li>Your membership in companies owned by someone else (their data stays with them).</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Deletion is immediate and cannot be undone. Payment records kept by our payment
              processor (Stripe) and backups are retained only as long as required by law and are
              then removed. If you have a paid plan, cancel it in Settings → Billing first.
            </p>
          </Card>

          <Card variant="glass" className="space-y-4 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Delete it now</h2>
            {accountLabel ? (
              <DeleteAccountPanel accountLabel={accountLabel} />
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <Link href="/?auth=login" className="font-medium text-foreground underline underline-offset-4">
                    Sign in
                  </Link>{' '}
                  with the account you want to delete, then go to{' '}
                  <span className="text-foreground">Settings → Account → Delete account</span>, or
                  open this page again.
                </p>
              </div>
            )}
          </Card>

          <Card variant="glass" className="space-y-3 p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Can&apos;t sign in?</h2>
            <p className="text-sm text-muted-foreground">
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`} className="font-medium text-foreground underline underline-offset-4">
                {SUPPORT_EMAIL}
              </a>{' '}
              from the email address or with the phone number on the account. We confirm the request
              and delete the account and its data within 30 days.
            </p>
          </Card>
        </article>
      </main>
    </SiteShell>
  )
}
