'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { EstimateDocument, type EstimateDocumentData, type DocumentClient } from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import { PaginatedPreview } from '@/components/workspace/estimate/paginated-preview'
import { usePaginatedPreview } from '@/components/workspace/estimate/use-paginated-preview'
import { EstimateFloatingActions } from '@/components/workspace/estimate/estimate-floating-actions'
import { PresentationSettingsPanel } from '@/components/workspace/estimate/presentation-settings-panel'
import { useReducer, useRef, useState } from 'react'
import type { DocumentCompany } from '@/lib/estimate/document/model'
import type { EstimateAction } from '@/components/workspace/estimate/use-estimate-reducer'

/**
 * Dev-only visual check of the estimate document without signing in, with
 * sample data: ?view=preview (editor/public classic), modern (public modern),
 * page (paginated classic), page-modern. The PDF is checked by rendering it
 * separately. Nothing imports this route.
 */
const SAMPLE_COMPANY_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#262626"/>' +
  '<text x="18" y="44" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="20" fill="#fff">Skale</text>' +
  '<text x="18" y="66" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="20" fill="#fff">Club</text>' +
  '<path d="M70 26v44H40" fill="none" stroke="#fff" stroke-width="3"/></svg>',
)

const COMPANY: DocumentCompany = {
  name: 'Skale Club',
  owner_name: 'Sample Owner',
  phone: '+1 (508) 555-0100',
  email: null,
  website: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  // The sample company's OWN logo (a stand-in drawn in the style of the Skale
  // Club mark), never the Xtimator platform logo: the estimate header always
  // shows the issuing company's logo.
  logo_url: SAMPLE_COMPANY_LOGO,
  brand_primary_color: '#3D6FEA',
}

const CLIENT: DocumentClient = {
  id: 'c1', name: 'Sophia Chen', email: 'sophia.chen@example.com', phone: '+1 (617) 555-0103',
  address: null, city: null, state: null, zip: null,
}

const DATA: EstimateDocumentData = {
  summary: 'Standard recurring cleaning of kitchen, bathrooms, bedrooms and living areas.',
  notes: null,
  timeline: null,
  payment_terms: 'Net 30',
  warranty_terms: null,
  discount_type: null,
  discount_value: 0,
  discount_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  subtotal: 180,
  total: 180,
  deposit_type: 'none',
  deposit_value: null,
  deposit: 0,
  balance_due: 180,
  currency_code: 'USD',
  sections: [{
    id: 's1', title: 'Routine Cleaning', subtotal: 180,
    items: [
      { id: 'i1', description: 'Recurring home cleaning — standard visit', quantity: 1, unit: 'visit', unit_price: 180, total: 180 },
      { id: 'i2', description: 'Inside fridge (tax off, to check the off switch)', quantity: 1, unit: 'each', unit_price: 0, total: 0, taxable: false },
    ],
  }, {
    id: 's2', title: 'First-Visit Add-Ons', subtotal: 100,
    items: [
      { id: 'i3', description: 'Interior oven cleaning', quantity: 1, unit: 'each', unit_price: 45, total: 45 },
      { id: 'i4', description: 'Additional bathroom detail cleaning', quantity: 1, unit: 'each', unit_price: 55, total: 55 },
    ],
  }],
  estimate_date: '2026-11-06',
  estimate_number: 'SK-1049',
  presentation_settings: null,
}

const COMMON = {
  data: DATA, company: COMPANY, client: CLIENT, projectName: 'Biweekly Home Cleaning — Initial Visit',
  projectType: 'Recurring Service', estimateVersion: 1, estimateSeq: 1049, estimateCreatedAt: '2026-11-06T00:00:00Z',
} as const

// Edit views draw the editing controls (tax switches, Add section) without saving anything.
const noop = () => {}

type Sections = EstimateDocumentData['sections']

/** Dev-only item editing so ?view=edit can exercise the mobile item editor
 *  (open, change, add, delete, undo, duplicate, reorder). Totals are the plain
 *  qty × price − discount; the real reducer lives in use-estimate-reducer.ts. */
function devItemsReducer(sections: Sections, action: EstimateAction): Sections {
  const withTotals = (list: Sections): Sections =>
    list.map((s) => {
      const items = s.items.map((i) => ({ ...i, total: Math.max(0, i.quantity * i.unit_price - (i.discount ?? 0)) }))
      return { ...s, items, subtotal: items.reduce((n, i) => n + i.total, 0) }
    })
  const inSection = (id: string, fn: (items: Sections[number]['items']) => Sections[number]['items']) =>
    withTotals(sections.map((s) => (s.id === id ? { ...s, items: fn(s.items) } : s)))
  switch (action.type) {
    case 'UPDATE_ITEM':
      return inSection(action.sectionId, (items) => items.map((i) => (i.id === action.itemId ? { ...i, [action.field]: action.value } : i)))
    case 'APPLY_PRICE_BOOK_ITEM':
      return inSection(action.sectionId, (items) => items.map((i) => (i.id === action.itemId ? { ...i, description: action.item.name, unit: action.item.unit, unit_price: action.item.unit_price } : i)))
    case 'ADD_ITEM':
      return inSection(action.sectionId, (items) => [...items, { id: action.itemId ?? 'temp-' + crypto.randomUUID(), description: action.description ?? '', quantity: 1, unit: null, unit_price: 0, total: 0, taxable: true, discount: 0 }])
    case 'REMOVE_ITEM':
      return inSection(action.sectionId, (items) => items.filter((i) => i.id !== action.itemId))
    case 'INSERT_ITEM':
      return inSection(action.sectionId, (items) => [...items.slice(0, action.index), { ...action.item, id: action.itemId ?? 'temp-' + crypto.randomUUID() }, ...items.slice(action.index)])
    case 'REORDER_ITEMS':
      return inSection(action.sectionId, (items) => action.itemIds.map((id) => items.find((i) => i.id === id)!).filter(Boolean))
    default:
      return sections
  }
}

type DevTotals = Pick<EstimateDocumentData, 'discount_type' | 'discount_value' | 'tax_rate' | 'deposit_type' | 'deposit_value'>

function devTotalsReducer(t: DevTotals, action: EstimateAction): DevTotals {
  switch (action.type) {
    case 'UPDATE_DISCOUNT': return { ...t, discount_type: action.discount_type, discount_value: action.discount_value }
    case 'UPDATE_TAX_RATE': return { ...t, tax_rate: action.tax_rate }
    case 'UPDATE_DEPOSIT': return { ...t, deposit_type: action.deposit_type as DevTotals['deposit_type'], deposit_value: action.deposit_value }
    default: return t
  }
}

function DevEditableDocument() {
  const [sections, dispatchItems] = useReducer(devItemsReducer, DATA.sections)
  const [totals, dispatchTotals] = useReducer(devTotalsReducer, {
    discount_type: null, discount_value: 0, tax_rate: 0, deposit_type: 'none', deposit_value: null,
  } as DevTotals)
  const dispatch = (action: EstimateAction) => { dispatchItems(action); dispatchTotals(action) }
  const subtotal = sections.reduce((n, s) => n + s.subtotal, 0)
  const discount_amount = totals.discount_type === 'fixed' ? totals.discount_value : totals.discount_type ? subtotal * totals.discount_value / 100 : 0
  const tax_amount = Math.round((subtotal - discount_amount) * totals.tax_rate * 100) / 100
  const total = subtotal - discount_amount + tax_amount
  const deposit = totals.deposit_type === 'amount' ? (totals.deposit_value ?? 0) : totals.deposit_type === 'percent' ? Math.round(total * (totals.deposit_value ?? 0)) / 100 : 0
  const data = { ...DATA, ...totals, sections, subtotal, discount_amount, tax_amount, total, deposit, balance_due: total - deposit }
  return <EstimateDocument mode="edit" {...COMMON} data={data} dispatch={dispatch} projectId="demo" companyDefaults={{ tax_rate: 0.0825 } as never} />
}

export default function EstimatePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Preview />
}

function Preview() {
  const view = useSearchParams().get('view') ?? 'preview'
  const templateId = view === 'page-modern' ? 'modern' : 'classic'
  const { pages } = usePaginatedPreview({
    data: DATA, structuralEpoch: 0, company: COMPANY, templateId, preparedBy: null, language: 'en',
    projectName: COMMON.projectName, projectType: COMMON.projectType, client: CLIENT,
    estimateSeq: 1049, estimateCreatedAt: COMMON.estimateCreatedAt, enabled: view.startsWith('page'),
  })
  // The gear opens the editor's real settings panel (changes are not kept); Photos and Share do nothing here.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)
  const bar = (leading?: React.ReactNode) => <EstimateFloatingActions isCurrent status="idle" onSend={() => {}} onOpenPhotos={() => {}} onOpenSettings={() => setSettingsOpen((o) => !o)} settingsButtonRef={gearRef} leading={leading} />
  // md:ml-[213px] stands in for the app sidebar, to check the bar centres on the document.
  return <main className="min-h-dvh space-y-4 bg-background p-4 sm:p-8 md:ml-[213px]">
    <nav className="flex flex-wrap gap-2 text-xs">
      {['preview', 'edit', 'modern', 'page', 'page-edit', 'page-modern'].map((v) => (
        <a key={v} href={`?view=${v}`} className={`rounded border px-2 py-1 ${v === view ? 'border-primary text-primary' : ''}`}>{v}</a>
      ))}
    </nav>
    {view.startsWith('page')
      ? <PaginatedPreview {...COMMON} pages={pages} templateId={templateId} bottomBar={(leading) => bar(leading)} dispatch={view === 'page-edit' ? noop : undefined} />
      : <div className="mx-auto max-w-4xl space-y-3">
          {view === 'modern' ? <EstimateDocumentModern {...COMMON} />
            : view === 'edit' ? <DevEditableDocument />
              : <EstimateDocument mode="view" {...COMMON} />}
          {bar()}
        </div>}
    <PresentationSettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} settings={DATA.presentation_settings} onChange={noop} defaultTaxRate={0} estimateSentOrViewed={false} anchorRef={gearRef} />
  </main>
}
