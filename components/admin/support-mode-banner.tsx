import { ShieldCheck } from 'lucide-react'
import { endSupportSession } from '@/lib/auth/support-mode'

interface SupportModeBannerProps {
  companyName: string
  adminEmail: string
}

/**
 * Persistent banner shown across the tenant app shell while a super admin is
 * viewing a company via Support Mode (SUPPORT-02). Mirrors DemoBanner's exact
 * structure/classes — see components/demo/demo-banner.tsx.
 */
export function SupportModeBanner({ companyName, adminEmail }: SupportModeBannerProps) {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-center">
        Support Mode — viewing <strong>{companyName}</strong> as {adminEmail}.{' '}
        <form action={endSupportSession} className="inline">
          <button
            type="submit"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Exit Support Mode
          </button>
        </form>
      </span>
    </div>
  )
}
