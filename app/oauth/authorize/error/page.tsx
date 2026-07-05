import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

// Phase 86: inline error page used when the authorize server action discovers an
// invalid client or redirect_uri AFTER form submission (cannot safely redirect to
// an unverified redirect_uri at that point).

interface ErrorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const REASONS: Record<string, string> = {
  invalid_client_or_redirect: 'The client_id or redirect_uri is not valid for this authorization request.',
}

export default async function AuthorizeErrorPage({ searchParams }: ErrorPageProps) {
  const sp = await searchParams
  const reason = typeof sp.reason === 'string' ? sp.reason : ''
  const message = REASONS[reason] ?? 'Authorization request failed.'

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border border-destructive/40 bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-destructive">Authorization error</h1>
        <p className="mt-2 text-sm">{message}</p>
      </div>
    </div>
  )
}
