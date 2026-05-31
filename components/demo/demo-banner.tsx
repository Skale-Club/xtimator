import { Eye } from 'lucide-react'
import { exitDemoToSignup } from '@/lib/demo/actions'

/**
 * Fixed read-only demo banner shown across the app when the active company is
 * the public demo company (Decision D09). Explains the demo is read-only with
 * sample data and offers a signup CTA that ends the demo session first.
 *
 * Mirrors the layout/styling of TrialBanner for visual consistency.
 */
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
      <Eye className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-center">
        You&apos;re viewing a read-only Xtimator demo with sample data.{' '}
        <form action={exitDemoToSignup} className="inline">
          <button
            type="submit"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Create your account
          </button>
        </form>{' '}
        to build real estimates.
      </span>
    </div>
  )
}
