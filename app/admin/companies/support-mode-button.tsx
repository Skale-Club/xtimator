'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Loader2 } from 'lucide-react'
import { startSupportSessionAction } from './support-mode-actions'

interface SupportModeButtonProps {
  companyId: string
}

/**
 * Companies-list row action — starts a Support Mode session for this company
 * and navigates the admin into the tenant's /dashboard view (SUPPORT-01).
 * Mirrors HandoffButton's client-component + useTransition + toast.error
 * shape exactly: startSupportSession() (Plan 01) THROWS on failure rather
 * than returning a result object, so failures are caught here and surfaced
 * via toast.error(...) per 151-UI-SPEC.md's locked Copywriting Contract —
 * the admin must see an error toast and stay on the Companies list, never
 * an unhandled Next.js error page.
 * Visually distinct from HandoffButton (its paper-plane icon, "Hand off") and
 * the plain "Configure →" text link — Eye icon, "Support Mode →" label, per 151-UI-SPEC.md.
 */
export function SupportModeButton({ companyId }: SupportModeButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        await startSupportSessionAction(companyId)
      } catch (err) {
        const reason = err instanceof Error ? err.message : undefined
        toast.error(
          reason ? `Couldn't start Support Mode. ${reason}` : "Couldn't start Support Mode. Please try again."
        )
        return
      }
      router.push('/dashboard')
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline font-medium disabled:opacity-50"
    >
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
      Support Mode →
    </button>
  )
}
