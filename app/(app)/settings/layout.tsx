// v3-subsidebar-mobile
import { redirect } from 'next/navigation'
import { SettingsNav } from '@/components/settings/settings-nav'
import { isDemoSession } from '@/lib/demo/guard'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Settings exposes branding/integrations/billing — never available in the demo.
  if (await isDemoSession()) redirect('/dashboard')

  return (
    <div className="flex min-h-full flex-col md:flex-row md:gap-0">
      {/*
        Mobile  (< md): sticky horizontal nav bar below the app header.
          - overflow-x-auto  → touch-scroll works natively on iOS/Android
          - scrollbar-none   → hides the ugly browser scrollbar
          - fade mask        → right-edge gradient signals "more content here"
        Desktop (md+):  vertical sidebar, no scroll needed.
      */}

      {/* Wrapper needed for the right-edge fade mask on mobile */}
      <div className="relative sticky top-0 z-20 shrink-0 md:static md:z-auto md:w-52">
        {/* Fade gradient — visible only on mobile, hidden on desktop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
        />

        <aside
          className={[
            'shrink-0 border-border bg-background',
            // mobile
            'w-full border-b px-2 py-2',
            'overflow-x-auto scrollbar-none',
            // desktop
            'md:overflow-x-visible md:border-b-0 md:border-r md:px-3 md:py-8',
          ].join(' ')}
        >
          <SettingsNav />
        </aside>
      </div>

      {/* Page content */}
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  )
}
