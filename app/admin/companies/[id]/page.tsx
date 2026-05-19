import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { getSelectedAIProvider, getOpenRouterDefaultModel } from '@/lib/platform-config'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { CompanyModelOverrideForm } from './company-model-override-form'

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
    .select('id, name, tier, ai_model_override')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const company = data as {
    id: string
    name: string
    tier: string
    ai_model_override: string | null
  }

  const [activeProvider, globalModel] = await Promise.all([
    getSelectedAIProvider(),
    getOpenRouterDefaultModel(),
  ])

  const effectiveModel = company.ai_model_override
    ? `${company.ai_model_override} (override)`
    : activeProvider === 'openrouter'
      ? `${globalModel ?? 'anthropic/claude-3.5-sonnet'} (platform default)`
      : `${activeProvider} adapter (no model override)`

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
    </div>
  )
}
