'use client'

import { Suspense, useMemo } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { ChangeOrderEditor } from '@/components/workspace/change-orders/change-order-editor'
import type { ChangeOrderActions } from '@/components/workspace/change-orders/change-order-actions'
import type { ChangeOrder, ContractSummary } from '@/lib/change-orders/types'

/**
 * Dev-only fixture for the owner's change order editor, without signing in:
 * ?state=draft|sent|approved|declined. Sample data and fake actions (nothing
 * touches the network); the PDF button and "Open" still open real URLs.
 * Nothing imports this route.
 */
const STATES = ['draft', 'sent', 'approved', 'declined'] as const
type FixtureState = (typeof STATES)[number]

const CONTRACT: ContractSummary = {
  estimateId: 'dev-estimate',
  currencyCode: 'USD',
  estimateNumber: 'NP-1045',
  acceptedAt: '2026-11-06T15:00:00.000Z',
  signedOnline: true,
  baseTotal: 3486,
  changeOrders: [
    { id: 'co-1', number: 1, title: 'Garage painting', status: 'accepted', total: 800, sent_at: '2026-11-09T09:00:00.000Z', responded_at: '2026-11-10T09:00:00.000Z', view_count: 2, invoice_status: 'open' },
  ],
  approvedTotal: 800,
  pendingTotal: 0,
  contractTotal: 4286,
}

function sample(state: FixtureState): ChangeOrder {
  const shared = state !== 'draft'
  const answered = state === 'approved' || state === 'declined'
  return {
    id: 'co-2',
    company_id: 'dev-company',
    project_id: 'dev-project',
    estimate_id: 'dev-estimate',
    number: 2,
    title: state === 'draft' ? '' : 'Extra coat on the hallway',
    reason: state === 'draft' ? null : 'The client asked for a third coat after the color change.',
    extra_days: state === 'draft' ? null : 1,
    status: answered ? 'accepted' : shared ? 'sent' : 'draft',
    share_token: 'sample-change-order-token',
    sent_at: shared ? '2026-11-16T09:00:00.000Z' : null,
    viewed_at: shared ? '2026-11-16T10:00:00.000Z' : null,
    view_count: shared ? 3 : 0,
    responded_at: answered ? '2026-11-16T15:00:00.000Z' : null,
    client_response: state === 'approved' ? 'accepted' : state === 'declined' ? 'declined' : null,
    tax_rate: 0.0625,
    subtotal: 750,
    tax_amount: 31.25,
    total: 781.25,
    currency_code: 'USD',
    created_at: '2026-11-15T00:00:00.000Z',
    updated_at: '2026-11-16T08:00:00.000Z',
    items:
      state === 'draft'
        ? []
        : [
            { id: 'i1', description: 'Hallway: third finish coat', quantity: 1, unit: null, unit_price: 800, total: 800, taxable: true, sort_order: 0 },
            { id: 'i2', description: 'Credit: skip baseboard painting', quantity: 1, unit: null, unit_price: -50, total: -50, taxable: true, sort_order: 1 },
          ],
    hasSignature: false,
    signature: null,
  }
}

function fakeActions(): Partial<ChangeOrderActions> {
  return {
    saveChangeOrder: async (input) => {
      const subtotal = input.items.reduce((s, i) => s + Math.round(i.quantity * i.unit_price * 100) / 100, 0)
      return { data: { updated_at: new Date().toISOString(), subtotal, tax_amount: 0, total: subtotal } }
    },
    markChangeOrderShared: async () => ({ data: { sent_at: new Date().toISOString() } }),
    deleteChangeOrder: async (id) => ({ data: { id } }),
    recordChangeOrderResponse: async (_id, response) => ({
      data: { client_response: response, responded_at: response ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
    }),
    getContractSummary: async () => ({ data: CONTRACT }),
    createChangeOrder: async () => ({ data: { id: 'co-3', number: 3 } }),
  }
}

function Fixture() {
  const params = useSearchParams()
  const raw = params.get('state') ?? 'draft'
  const state: FixtureState = (STATES as readonly string[]).includes(raw) ? (raw as FixtureState) : 'draft'
  const changeOrder = useMemo(() => sample(state), [state])
  const actions = useMemo(() => fakeActions(), [])
  return (
    <div data-editor-frame="v2" className="flex min-h-[100dvh] flex-col bg-background">
      <nav className="flex flex-wrap gap-2 bg-muted/30 px-3 py-2 text-xs">
        {STATES.map((s) => (
          <a key={s} href={`?state=${s}`} className={`rounded border bg-background px-2 py-1 ${s === state ? 'border-primary text-primary' : ''}`}>
            {s}
          </a>
        ))}
      </nav>
      <ChangeOrderEditor
        key={state}
        changeOrder={changeOrder}
        contract={CONTRACT}
        project={{ id: 'dev-project', name: 'Two-Bedroom Color Refresh', clientName: 'Ava Thompson' }}
        company={{ name: 'Norte Pinturas', logo_url: null, phone: '(555) 010-2030', digital_signature_enabled: true }}
        actions={actions}
      />
    </div>
  )
}

export default function ChangeOrderFixture() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <Suspense fallback={null}>
      <Fixture />
    </Suspense>
  )
}
