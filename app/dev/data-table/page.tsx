'use client'

import { useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { ProjectList } from '@/components/dashboard/project-list'
import { ClientList } from '@/components/clients/client-list'
import { PriceBookList } from '@/components/price-book/price-book-list'
import { ClientHeader } from '@/components/clients/client-header'
import { ClientInfoGrid } from '@/components/clients/client-info-grid'
import { ClientProjectsSection } from '@/components/clients/client-projects-section'
import { ListCard, ListPage } from '@/components/ui/list-page'
import DashboardLoading from '@/app/(app)/dashboard/loading'
import ProjectsLoading from '@/app/(app)/projects/loading'
import ClientsLoading from '@/app/(app)/clients/loading'
import PriceBookLoading from '@/app/(app)/price-book/loading'
import type { ProjectWithClient } from '@/lib/queries/dashboard'
import type { ClientDetail } from '@/lib/queries/clients'
import type { PriceBookFolder, PriceBookItem } from '@/lib/queries/price-book'

/**
 * Dev-only check for the shared list toolbar without signing in: the real
 * Recent projects, Clients and Price Book lists with sample rows
 * (?view=projects|clients|pricebook), and their loading skeletons (?view=sk-…). "Delete newest 2" shrinks the project
 * data the way a delete does, to check the page clamp. Nothing imports this.
 */
const STATUSES = ['draft', 'estimate_ready', 'sent', 'estimate_ready', 'draft', 'sent'] as const
const NAMES = [
  'Kitchen Remodel', 'Water Heater Replacement', 'Deck Staining', 'Roof Repair', 'Bathroom Tile',
  'Fence Install', 'Interior Painting', 'HVAC Tune-up', 'Driveway Sealing', 'Gutter Cleaning',
  'Window Replacement', 'Basement Waterproofing',
]
const CLIENT_NAMES = ['Ava Thompson', 'Ben Carter', 'Dana Lopez', 'Evan Brooks', 'Fiona Park', 'Grace Kim']

function sampleProjects(): ProjectWithClient[] {
  return NAMES.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    project_type: i % 2 ? 'Plumbing' : 'Remodel',
    // No 'paid' rows on purpose: the Paid tab must show a recoverable empty state.
    status: STATUSES[i % STATUSES.length],
    total: 800 + i * 437,
    currency_code: 'USD',
    created_at: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(),
    client: i % 4 === 2 ? null : { id: `c${i % 4}`, name: CLIENT_NAMES[i % 4] },
    payment_status: null,
    paid_at: null,
  }))
}

const CLIENTS: Array<ClientDetail & { total_value: number; last_activity_at: string | null }> = CLIENT_NAMES.map((name, i) => ({
  id: `c${i}`,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  phone: i % 3 === 2 ? null : `+1617555${String(100 + i).padStart(4, '0')}`,
  logo_url: null,
  created_at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
  project_count: (i * 3) % 7,
  total_value: ((i * 3) % 7) * 1375,
  last_activity_at: (i * 3) % 7 ? new Date(Date.UTC(2026, 10, 1 + (i % 12))).toISOString() : null,
  address: null, city: i % 4 === 3 ? null : ['Boston', 'Winchester', 'Cambridge'][i % 3], state: i % 4 === 3 ? null : 'MA', zip: null, notes: null, preferred_language: null,
}))

const FOLDERS: PriceBookFolder[] = [
  { id: 'f1', company_id: 'demo', name: 'Remodeling & Construction', sort_order: 0, created_at: '2026-10-01T00:00:00Z' },
  { id: 'f2', company_id: 'demo', name: 'Plumbing', sort_order: 1, created_at: '2026-10-01T00:00:00Z' },
]

const ITEMS: PriceBookItem[] = [
  ['Drywall repair', 'f1', 180], ['Tile install', 'f1', 12], ['Demolition', 'f1', 450],
  ['Water heater install', 'f2', 1450], ['Leak repair', 'f2', 220], ['Faucet replacement', null, 160],
].map(([name, folder, price], i) => ({
  id: `i${i}`,
  company_id: 'demo',
  currency_code: 'USD',
  folder_id: folder as string | null,
  folder_name: folder ? FOLDERS.find((f) => f.id === folder)!.name : null,
  name: name as string,
  unit: 'each',
  unit_price: price as number,
  notes: null,
  created_at: '2026-10-01T00:00:00Z',
  image_url: null,
  image_position: null,
  pricing_type: 'fixed',
  base_price: null,
  price_per_unit: null,
  minimum_price: null,
  area_sizes: null,
}))

export default function DataTablePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Preview />
}

function Preview() {
  const view = useSearchParams().get('view') ?? 'projects'
  const [projects, setProjects] = useState(sampleProjects)
  // md:ml-[213px] stands in for the app sidebar (213px from 768px up), so widths match the real shell.
  return <main className="min-h-dvh space-y-4 bg-background p-4 sm:p-6 md:ml-[213px]">
    <nav className="flex flex-wrap gap-2 text-xs">
      {['projects', 'clients', 'client', 'pricebook', 'sk-dashboard', 'sk-projects', 'sk-clients', 'sk-pricebook'].map((v) => (
        <a key={v} href={`?view=${v}`} className={`rounded border px-2 py-1 ${v === view ? 'border-primary text-primary' : ''}`}>{v}</a>
      ))}
      {view === 'projects' && <>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setProjects(p => [...p].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(2))}>
          Delete newest 2
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setProjects(sampleProjects())}>
          Reset data ({projects.length} rows)
        </button>
      </>}
    </nav>
    {/* Clients and the Price Book draw their own panel, like their real pages. */}
    {view === 'clients' ? <div className="w-full space-y-4 p-4 sm:p-6"><ClientList clients={CLIENTS} companyId="demo" currencyCode="USD" /></div>
      : view === 'client' ? <ClientPageFixture />
      : view === 'pricebook' ? <div className="w-full space-y-4 p-4 sm:p-6"><PriceBookList items={ITEMS} folders={FOLDERS} companyId="demo" currencyCode="USD" /></div>
        : view === 'sk-dashboard' ? <DashboardLoading />
          : view === 'sk-projects' ? <ProjectsLoading />
            : view === 'sk-clients' ? <ClientsLoading />
              : view === 'sk-pricebook' ? <PriceBookLoading />
                : <ListCard><ProjectList projects={projects} /></ListCard>}
  </main>
}

/** The client page with fixture data (the real page needs a signed-in company). */
function ClientPageFixture() {
  const client = { ...CLIENTS[1], phone: '+16175550105', address: '12 Oak Street', city: 'Winchester', state: 'MA', zip: '01890', notes: 'Prefers morning appointments and low-odor cleaning products.', preferred_language: 'en' }
  const projects = [
    { id: 'p1', name: 'Kitchen Update Budget Estimate', project_type: 'Remodel', status: 'sent', total: 2412, created_at: '2026-11-09T12:00:00Z' },
    { id: 'p2', name: 'Bathroom Repaint', project_type: 'Painting', status: 'draft', total: 1621, created_at: '2026-10-20T12:00:00Z' },
  ]
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ClientHeader client={client} companyId="demo" currencyCode="USD" totalValue={4033} activeCount={2} lastActivityAt={projects[0].created_at} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <ClientProjectsSection clientId={client.id} clientName={client.name} projects={projects as never} currencyCode="USD" />
        <div className="lg:sticky lg:top-4"><ClientInfoGrid client={client} /></div>
      </div>
    </div>
  )
}
