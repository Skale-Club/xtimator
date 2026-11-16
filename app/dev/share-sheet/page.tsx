'use client'

import { useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { SendHubDialog } from '@/components/workspace/send/send-hub-dialog'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

/**
 * Dev-only fixture for the editor's Share estimate sheet, without signing in:
 * ?state=new|opened|accepted|password. Sample data, nothing is fetched on load;
 * the copy / open / password buttons call the real handlers, so only use them
 * against a dev session. Nothing imports this route.
 */
const STATES = ['new', 'opened', 'accepted', 'password'] as const
type FixtureState = (typeof STATES)[number]

const TEMPLATE: EstimateTemplate = {
  greeting: 'Hi {client_name},',
  opener: 'Thank you for reaching out to {company_name}! Here is your estimate:',
  closer: 'Any questions, just reply to me.',
  signature: 'Best regards,\n{owner_name}\n{company_name}',
}

function sampleEstimate(state: FixtureState): EstimateWithSections {
  const base = {
    id: 'dev-estimate',
    project_id: 'dev-project',
    company_id: 'dev-company',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1045,
    estimate_number: 'NP-1045',
    estimate_date: '2026-11-06',
    is_current: true,
    share_token: 'sample-share-token',
    public_slug_token: 'np-1045',
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: '2 to 3 business days after the colors are approved.',
    payment_terms: '30% deposit on approval, balance on completion.',
    warranty_terms: null,
    subtotal: 3486,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 3486,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: 3486,
    sent_at: '2026-11-16T09:00:00.000Z',
    viewed_at: null,
    responded_at: null,
    view_count: 0,
    last_viewed_at: null,
    share_password_hash: null,
    share_password_set_at: null,
    client_response: null,
    created_at: '2026-11-06T00:00:00.000Z',
    updated_at: '2026-11-06T00:00:00.000Z',
    presentation_settings: null,
    sections: [
      {
        id: 's1', estimate_id: 'dev-estimate', company_id: 'dev-company', title: 'Surface Preparation', sort_order: 0, subtotal: 660,
        items: [
          { id: 'i1', section_id: 's1', company_id: 'dev-company', description: 'Furniture protection, masking and daily cleanup', quantity: 1, unit: null, unit_price: 225, total: 225, sort_order: 0, price_source: null },
          { id: 'i2', section_id: 's1', company_id: 'dev-company', description: 'Drywall patch and texture blend', quantity: 1, unit: null, unit_price: 435, total: 435, sort_order: 1, price_source: null },
        ],
      },
      {
        id: 's2', estimate_id: 'dev-estimate', company_id: 'dev-company', title: 'Painting', sort_order: 1, subtotal: 2826,
        items: [
          { id: 'i3', section_id: 's2', company_id: 'dev-company', description: 'Walls: preparation and two finish coats', quantity: 1, unit: null, unit_price: 1710, total: 1710, sort_order: 0, price_source: null },
          { id: 'i4', section_id: 's2', company_id: 'dev-company', description: 'Ceiling: preparation and two finish coats', quantity: 1, unit: null, unit_price: 1116, total: 1116, sort_order: 1, price_source: null },
        ],
      },
    ],
    attachedPhotos: [],
  }
  const variant: Partial<EstimateWithSections> =
    state === 'accepted'
      ? { client_response: 'accepted', responded_at: '2026-11-16T15:00:00.000Z', view_count: 3, last_viewed_at: '2026-11-16T14:00:00.000Z' }
      : state === 'password'
        ? { share_password_hash: 'dev-hash' }
        : {}
  return { ...base, ...variant } as unknown as EstimateWithSections
}

function Fixture() {
  const params = useSearchParams()
  const raw = params.get('state') ?? 'new'
  const state: FixtureState = (STATES as readonly string[]).includes(raw) ? (raw as FixtureState) : 'new'
  const opened = state === 'opened'
  const [fortyMinutesAgo] = useState(() => new Date(Date.now() - 40 * 60_000).toISOString())
  return (
    <div className="min-h-dvh bg-muted/30 p-4 text-xs">
      <nav className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <a key={s} href={`?state=${s}`} className={`rounded border bg-background px-2 py-1 ${s === state ? 'border-primary text-primary' : ''}`}>{s}</a>
        ))}
      </nav>
      <SendHubDialog
        open
        onOpenChange={() => {}}
        estimate={sampleEstimate(state)}
        projectName="Two-Bedroom Color Refresh"
        companyName="Norte Pinturas"
        companySlug="norte-pinturas"
        companyLogoUrl={null}
        clientName="Ava Thompson"
        ownerName="Daniel Castro"
        estimateTemplate={TEMPLATE}
        viewCount={opened ? 3 : state === 'accepted' ? 3 : 0}
        lastViewedAt={opened ? fortyMinutesAgo : state === 'accepted' ? '2026-11-16T14:00:00.000Z' : null}
      />
    </div>
  )
}

export default function ShareSheetPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Fixture />
}
