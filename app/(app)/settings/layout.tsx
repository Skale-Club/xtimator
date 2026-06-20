// v3-subsidebar-mobile
import { SettingsNav } from '@/components/settings/settings-nav'
import { PageHeading } from '@/components/app-shell/page-heading'
import { T } from '@/components/i18n/t'
import { isDemoSession } from '@/lib/demo/guard'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { CompanyInfoForm } from '@/components/settings/company-info-form'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Settings exposes branding / integrations / billing / account controls that
  // must never be reachable in the public demo. Rather than bouncing demo
  // visitors away entirely, show a single READ-ONLY Profile view (company info)
  // and ignore the requested sub-tab. This keeps the navbar person icon useful
  // while sensitive tabs stay completely out of reach.
  if (await isDemoSession()) {
    const claims = await getAuthClaims()
    const supabase = await createClient()
    const company = claims ? await getCompanySettings(supabase, claims.sub as string) : null

    return (
      <div className="flex min-h-full flex-col">
        <div className="px-4 pt-4 md:px-6 md:pt-8">
          <PageHeading><T>Profile</T></PageHeading>
        </div>
        <div className="p-4 md:p-6">
          {company ? <CompanyInfoForm company={company} readOnly /> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Page heading lives here (not the navbar), matching the other top-level pages. */}
      <div className="px-4 pt-4 md:px-6 md:pt-8">
        <PageHeading><T>Profile</T></PageHeading>
      </div>
      <div className="flex flex-1 flex-col md:flex-row md:gap-0">
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
    </div>
  )
}
