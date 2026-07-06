import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { getOpenRouterDefaultModel } from '@/lib/platform-config'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { getCompanyCostOverview } from '@/lib/queries/admin-company-cost'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { CompanyModelOverrideForm } from './company-model-override-form'
import { CompanyQuotaForm } from './company-quota-form'
import { CompanyByokForm } from './company-byok-form'
import { CompanyCostCard } from './company-cost-card'

export const dynamic = 'force-dynamic'

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const svc = requireServiceClient()
  const { data } = await svc
    .from('companies')
    .select('id, name, tier, ai_model_override, demo_estimate_quota, byok_enabled, byok_key_last4')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const company = data as {
    id: string
    name: string
    tier: string
    ai_model_override: string | null
    demo_estimate_quota: number | null
    byok_enabled: boolean | null
    byok_key_last4: string | null
  }

  // Count current estimates for usage display
  const { count: estimateCount } = await svc
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)

  const globalModel = await getOpenRouterDefaultModel()

  const cfg = await getBillingConfig()
  const costOverview = await getCompanyCostOverview(company.id, cfg.markup)

  // OpenRouter is the single AI engine: effective model is the per-company
  // override when set, else the platform-wide OpenRouter default.
  const effectiveModel = company.ai_model_override
    ? `${company.ai_model_override} (override)`
    : `${globalModel ?? OR_DEFAULTS.chat} (platform default)`

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/admin/companies"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          <T>All companies</T>
        </Link>
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          {company.name || '(unnamed)'}
        </h1>
        <p className="text-muted-foreground text-sm">
          <T>Tier:</T> <span className="font-medium">{company.tier}</span>
          {' · '}
          <span className="font-mono text-xs">{company.id}</span>
        </p>
      </div>

      <Card variant="glass" className="p-6 md:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-medium"><T>AI Model Override</T></h2>
          <p className="text-sm text-muted-foreground mt-1">
            <T>
              Pick a specific OpenRouter model for this company. When set, every
              estimate generation for this tenant uses this model regardless of
              the platform-wide active provider. Clear the field to revert to
              the global default.
            </T>
          </p>
        </div>

        <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs">
          <span className="text-muted-foreground"><T>Currently effective:</T></span>{' '}
          <span className="font-mono">{effectiveModel}</span>
        </div>

        <CompanyModelOverrideForm
          companyId={company.id}
          initialModel={company.ai_model_override}
        />
      </Card>

      <Card variant="glass" className="p-6 md:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-medium"><T>Demo Estimate Quota</T></h2>
          <p className="text-sm text-muted-foreground mt-1">
            <T>
              Cap the number of estimates this company can generate. Blank = unlimited.
              Paid tier companies (pro/business) bypass this check automatically.
            </T>
          </p>
        </div>

        <div className="rounded-md border bg-muted/20 px-4 py-3 text-xs space-y-1">
          <div>
            <span className="text-muted-foreground"><T>Current quota:</T></span>{' '}
            <span className="font-mono">
              {company.demo_estimate_quota !== null
                ? String(company.demo_estimate_quota)
                : 'unlimited'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground"><T>Estimates generated:</T></span>{' '}
            <span className="font-mono">{estimateCount ?? 0}</span>
          </div>
        </div>

        <CompanyQuotaForm
          companyId={company.id}
          initialQuota={company.demo_estimate_quota}
        />
      </Card>

      <Card variant="glass" className="p-6 md:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-medium"><T>BYOK — Bring Your Own Key</T></h2>
          <p className="text-sm text-muted-foreground mt-1">
            <T>
              Hidden plan, enabled only here: the company runs its AI on its OWN
              OpenRouter key and never spends platform credits. The key is stored
              encrypted and shown only as a last-4 hint.
            </T>
          </p>
        </div>

        <CompanyByokForm
          companyId={company.id}
          byokEnabled={Boolean(company.byok_enabled)}
          keyLast4={(company.byok_key_last4 as string | null) ?? null}
        />
      </Card>

      <Card variant="glass" className="p-6 md:p-8 space-y-4">
        <CompanyCostCard overview={costOverview} />
      </Card>
    </div>
  )
}
