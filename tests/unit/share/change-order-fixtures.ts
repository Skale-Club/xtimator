// Shared fixture for the change order public page, contract section and PDF tests.
import type { ChangeOrder, PublicChangeOrderData } from '@/lib/change-orders/types'
import { SIGNATURE_FIXTURE } from '../estimate/fixtures/document-fixtures'

export function buildChangeOrder(over: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: 'co1',
    company_id: 'c1',
    project_id: 'p1',
    estimate_id: 'e1',
    number: 1,
    title: 'Garage painting',
    reason: 'The client asked to paint the garage too.',
    extra_days: 3,
    status: 'sent',
    share_token: 'tok-co1',
    sent_at: '2026-02-01T10:00:00Z',
    viewed_at: null,
    view_count: 0,
    responded_at: null,
    client_response: null,
    tax_rate: 0,
    subtotal: 1100,
    tax_amount: 0,
    total: 1100,
    currency_code: 'USD',
    created_at: '2026-02-01T09:00:00Z',
    updated_at: '2026-02-01T10:00:00.123456+00:00',
    items: [
      { id: 'i1', description: 'Paint garage walls', quantity: 1, unit: null, unit_price: 1500, total: 1500, taxable: false, sort_order: 0 },
      { id: 'i2', description: 'Remove the shed repaint', quantity: 1, unit: null, unit_price: -400, total: -400, taxable: false, sort_order: 1 },
    ],
    hasSignature: false,
    signature: null,
    ...over,
  }
}

export function buildChangeOrderData(
  over: Partial<ChangeOrder> = {},
  companyOver: Partial<PublicChangeOrderData['company']> = {},
  dataOver: Partial<PublicChangeOrderData> = {},
): PublicChangeOrderData {
  const changeOrder = buildChangeOrder(over)
  return {
    changeOrder,
    company: {
      id: 'c1',
      name: 'Acme',
      logo_url: null,
      phone: '(555) 123-4567',
      email: 'a@b.co',
      brand_primary_color: '#2563eb',
      digital_signature_enabled: true,
      ...companyOver,
    },
    estimate: {
      id: 'e1',
      estimateNumber: 'SK-1045',
      projectName: 'Kitchen remodel',
      clientName: 'Pat Client',
      acceptedAt: '2026-01-10T12:00:00Z',
      publicPath: '/estimate/tok-est',
      language: 'en',
    },
    contract: {
      estimateId: 'e1',
      currencyCode: 'USD',
      estimateNumber: 'SK-1045',
      acceptedAt: '2026-01-10T12:00:00Z',
      signedOnline: true,
      baseTotal: 10000,
      changeOrders: [
        {
          id: changeOrder.id,
          number: changeOrder.number,
          title: changeOrder.title,
          status: changeOrder.status,
          total: changeOrder.total,
          sent_at: changeOrder.sent_at,
          responded_at: changeOrder.responded_at,
          view_count: 0,
        },
      ],
      approvedTotal: changeOrder.status === 'accepted' ? changeOrder.total : 0,
      pendingTotal: changeOrder.status === 'sent' ? changeOrder.total : 0,
      contractTotal: 10000 + (changeOrder.status === 'accepted' ? changeOrder.total : 0),
    },
    ...dataOver,
  }
}

export const SIGNED = {
  signer_name: SIGNATURE_FIXTURE.signerName,
  signed_at: '2026-02-03T15:00:00Z',
  signature_data: SIGNATURE_FIXTURE.signatureDataUrl,
}
