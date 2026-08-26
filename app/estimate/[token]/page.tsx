import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers, cookies } from 'next/headers'
import { getEstimateByShareToken, getShareLinkState, getShareLockCheck } from '@/lib/queries/share'
import { logEstimateView } from './actions'
import { EstimateView } from '@/components/share/estimate-view'
import { EstimateUnlockForm } from '@/components/share/estimate-unlock-form'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ESTIMATE_UNLOCK_COOKIE, hasValidUnlock } from '@/lib/auth/share-password'
import { ScopedLanguageProvider, type Language } from '@/lib/i18n/language-context'

interface SharePageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { token } = await params

  // Phase 193-02: the lock gate runs BEFORE any content-shaped fetch, even
  // for metadata -- a locked estimate's title/description must never carry
  // the project name (it would otherwise leak into page source / social
  // previews for anyone holding just the URL).
  const lock = await getShareLockCheck(token)
  if (lock.status !== 'ok') {
    return { title: 'Estimate Not Found' }
  }
  if (lock.passwordHash) {
    const cookieStore = await cookies()
    const cookieValue = cookieStore.get(ESTIMATE_UNLOCK_COOKIE)?.value
    if (!hasValidUnlock(cookieValue, lock.shareToken)) {
      return { title: 'Protected estimate' }
    }
  }

  const data = await getEstimateByShareToken(token)

  if (!data) {
    return { title: 'Estimate Not Found' }
  }

  return {
    title: `Estimate from ${data.estimate.company.name}`,
    description: `View estimate for ${data.estimate.project.name}`,
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params

  // Phase 193-02 — password gate, checked BEFORE any estimate content,
  // metadata, or signed photo URL is produced. getShareLockCheck only ever
  // selects share_password_hash/share_expires_at/language/company_id (plus
  // branding, only when a password is actually set) -- the full
  // getEstimateByShareToken fetch below never runs while locked.
  const lock = await getShareLockCheck(token)
  if (lock.status === 'missing') notFound()
  if (lock.status === 'expired') {
    return (
      <main className="max-w-lg mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">This estimate link has expired</h1>
        <p className="mt-3 text-muted-foreground">
          For your security, estimate links expire after a period of inactivity. Please ask the
          sender to re-send the estimate — that will give you a fresh, working link.
        </p>
      </main>
    )
  }

  if (lock.passwordHash) {
    const cookieStore = await cookies()
    const cookieValue = cookieStore.get(ESTIMATE_UNLOCK_COOKIE)?.value
    if (!hasValidUnlock(cookieValue, lock.shareToken)) {
      return (
        <ScopedLanguageProvider language={lock.language as Language} setLanguage={() => {}}>
          <EstimateUnlockForm
            token={token}
            companyName={lock.branding.companyName}
            logoUrl={lock.branding.logoUrl}
            brandColor={lock.branding.brandColor}
          />
        </ScopedLanguageProvider>
      )
    }
  }

  const data = await getEstimateByShareToken(token)

  if (!data) {
    // Distinguish an expired link from a genuinely missing one so the recipient
    // gets a helpful message (and knows to ask for a fresh link) rather than a 404.
    const linkState = await getShareLinkState(token)
    if (linkState === 'expired') {
      return (
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">This estimate link has expired</h1>
          <p className="mt-3 text-muted-foreground">
            For your security, estimate links expire after a period of inactivity. Please ask the
            sender to re-send the estimate — that will give you a fresh, working link.
          </p>
        </main>
      )
    }
    notFound()
  }

  // Log the view event (fire-and-forget, don't block render)
  logEstimateView(token).catch(() => {
    // Silently ignore view logging failures
  })

  const alreadyResponded = !!data.estimate.client_response
  const branding = await getBranding()
  const headersList = await headers()
  const isWhiteLabel = headersList.get('x-white-label') === '1'

  // Phase 71-09: inject tenant brand color as --platform-primary so the
  // forced-light scope cascades it into --primary, which gradient-brand +
  // gradient-hero consume via hsl(var(--primary)). RESEARCH G6 + G7.
  const tenantBrandHex = data.estimate.company.brand_primary_color
  const tenantBrandTriplet =
    (tenantBrandHex ? hexToHslTriplet(tenantBrandHex) : null) ??
    SYSTEM_COLORS.primaryHsl
  const brandStyle = {
    ['--platform-primary' as string]: tenantBrandTriplet,
  } as CSSProperties

  return (
    <div style={brandStyle} className="relative isolate min-h-screen">
      {/* Hero radial backdrop — re-tints with tenant --platform-primary */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[420px] gradient-hero" />
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <EstimateView
          estimate={data.estimate}
          client={data.client}
          token={token}
          alreadyResponded={alreadyResponded}
          appName={branding.appName}
          whiteLabelMode={isWhiteLabel}
        />
      </main>
    </div>
  )
}
