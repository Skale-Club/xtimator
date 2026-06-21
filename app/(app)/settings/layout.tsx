import { SettingsLayoutClient } from '@/components/settings/settings-layout-client'
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
      <SettingsLayoutClient>{children}</SettingsLayoutClient>
    </div>
  )
}
