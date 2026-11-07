import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings, getTradeSuggestion } from '@/lib/queries/company'
import { isDemoCompany } from '@/lib/demo/config'
import { CompanyInfoForm } from '@/components/settings/company-info-form'
import { TradeSuggestionBanner } from '@/components/settings/trade-suggestion-banner'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Company | Settings' }

export default async function CompanyTabPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)
  if (!company) redirect('/onboarding')

  // QUICK-psh-03: one-tap primary-trade suggestion, derived from repeated
  // detected_trade mismatches on kept generations (trade_mismatch_detected
  // activity rows — QUICK-mv1-01). null when no signal / dismissed / matched.
  const tradeSuggestion = await getTradeSuggestion(supabase, company.id)

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>Company</T>}
        description={<T>The business details your clients see on every estimate.</T>}
      />
      {tradeSuggestion && (
        <TradeSuggestionBanner
          suggestedTrade={tradeSuggestion.suggestedTrade}
          occurrences={tradeSuggestion.occurrences}
        />
      )}
      <CompanyInfoForm company={company} readOnly={isDemoCompany(company.id)} />
    </div>
  )
}
