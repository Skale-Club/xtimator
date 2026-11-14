'use client'

import { useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { ProjectList } from '@/components/dashboard/project-list'
import { ClientList } from '@/components/clients/client-list'
import { PriceBookList } from '@/components/price-book/price-book-list'
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

const CLIENTS: ClientDetail[] = CLIENT_NAMES.map((name, i) => ({
  id: `c${i}`,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  phone: null,
  logo_url: null,
  created_at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
  project_count: (i * 3) % 7,
  address: null, city: null, state: null, zip: null, notes: null, preferred_language: null,
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
      {['projects', 'clients', 'pricebook', 'sk-dashboard', 'sk-projects', 'sk-clients', 'sk-pricebook'].map((v) => (
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
    {/* Clients uses the same ListPage frame as its real page; the Price Book draws its own panel. */}
    {view === 'clients' ? <ListPage><ClientList clients={CLIENTS} companyId="demo" /></ListPage>
      : view === 'pricebook' ? <div className="w-full space-y-4 p-4 sm:p-6"><PriceBookList items={ITEMS} folders={FOLDERS} companyId="demo" currencyCode="USD" /></div>
        : view === 'sk-dashboard' ? <DashboardLoading />
          : view === 'sk-projects' ? <ProjectsLoading />
            : view === 'sk-clients' ? <ClientsLoading />
              : view === 'sk-pricebook' ? <PriceBookLoading />
                : <ListCard><ProjectList projects={projects} /></ListCard>}
  </main>
}
