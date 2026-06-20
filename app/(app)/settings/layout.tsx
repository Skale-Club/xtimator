import { SettingsNav } from '@/components/settings/settings-nav'
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
        <div className="p-4 md:p-6">
          {company ? <CompanyInfoForm company={company} readOnly /> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1 flex-col min-h-0 md:flex-row md:gap-0">
      {/*
        Mobile  (< md): sticky horizontal nav bar below the app header.
        Desktop (md+): fixed vertical sidebar pinned to the left of the content
          area. The primary sidebar exposes its width as --app-sidebar-width so
          the sub-nav stays aligned even when the primary sidebar is collapsed.
          The page content is offset so it never sits underneath the fixed sub-nav.
      */}

      {/* Wrapper needed for the right-edge fade mask on mobile + fixed positioning on desktop */}
      <div className="relative sticky top-0 z-20 shrink-0 md:fixed md:left-[var(--app-sidebar-width)] md:top-16 md:z-30 md:h-[calc(100vh-4rem)] md:w-52">
        {/* Fade gradient — visible only on mobile, hidden on desktop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
        />

        <aside
          className={[
            'shrink-0 border-border bg-background h-full',
            // mobile
            'w-full border-b px-2 py-2',
            'overflow-x-auto scrollbar-none',
            // desktop
            'md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-8',
          ].join(' ')}
        >
          <SettingsNav />
        </aside>
      </div>

      {/* Page content — offset on desktop so it doesn't sit underneath the fixed sidebar */}
      <div className="min-w-0 flex-1 md:ml-52">
        {children}
      </div>
      </div>
    </div>
  )
}
