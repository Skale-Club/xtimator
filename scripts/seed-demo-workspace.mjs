/**
 * Seed (and optionally reset) the public demo workspace with realistic,
 * fictional sample data for a US service business.
 *
 * Idempotent: every row uses a deterministic UUID derived from DEMO_COMPANY_ID,
 * so re-running upserts in place rather than duplicating. Uses the service-role
 * client, which bypasses RLS (so the read-only demo trap does not block seeding).
 *
 * Prerequisites (see DEMO-WORKSPACE.md):
 *   1. The demo auth user already exists in Supabase Auth.
 *   2. Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or
 *      SUPABASE_SERVICE_ROLE_KEY), DEMO_USER_EMAIL, and optionally DEMO_COMPANY_ID.
 *
 * Usage:
 *   node scripts/seed-demo-workspace.mjs            # upsert demo data
 *   node scripts/seed-demo-workspace.mjs --reset    # delete demo data, then re-seed
 *   node scripts/seed-demo-workspace.mjs --dry-run  # print plan, write nothing
 */
import { createClient } from '@supabase/supabase-js'

const RESET = process.argv.includes('--reset')
const DRY_RUN = process.argv.includes('--dry-run')

const DEMO_COMPANY_ID =
  process.env.DEMO_COMPANY_ID ?? '0000de00-0000-0000-0000-000000000001'
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  fail('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')
}
if (!DEMO_USER_EMAIL) {
  fail('Missing DEMO_USER_EMAIL (the shared demo user must exist in Supabase Auth first)')
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Deterministic child id derived from the demo company id + a stable suffix, so
// re-runs upsert the same rows. Format: 0000de00-0000-0000-<grp>-<nnnnnnnnnnnn>.
function demoId(group, n) {
  const g = String(group).padStart(4, '0')
  const seq = String(n).padStart(12, '0')
  return `0000de00-0000-0000-${g}-${seq}`
}

const round = (v) => Math.round(v * 100) / 100

// ---------------------------------------------------------------------------
// Fictional dataset — coherent across clients → projects → estimates.
// ---------------------------------------------------------------------------
const CLIENTS = [
  { name: 'Maple Street Residence', email: 'owner@example.com', phone: '+15550100', city: 'Austin', state: 'TX', zip: '78701', address: '124 Maple St' },
  { name: 'Riverside Cafe', email: 'manager@example.com', phone: '+15550101', city: 'Austin', state: 'TX', zip: '78702', address: '88 Riverside Dr' },
  { name: 'Oakwood Apartments', email: 'pm@example.com', phone: '+15550102', city: 'Round Rock', state: 'TX', zip: '78664', address: '9 Oakwood Ln' },
  { name: 'Sunset Dental Office', email: 'office@example.com', phone: '+15550103', city: 'Austin', state: 'TX', zip: '78704', address: '450 Sunset Blvd' },
]

// Each project belongs to clients[clientIdx] and carries one consolidated estimate.
const PROJECTS = [
  {
    clientIdx: 0, name: 'Kitchen Remodel — Cabinets & Counters', project_type: 'remodel',
    status: 'sent', estimateStatus: 'sent', summary: 'Full kitchen refresh: new shaker cabinets, quartz counters, and tile backsplash.',
    sections: [
      { title: 'Cabinetry', items: [
        { description: 'Shaker base cabinets (linear ft)', quantity: 14, unit: 'ft', unit_price: 185 },
        { description: 'Shaker wall cabinets (linear ft)', quantity: 12, unit: 'ft', unit_price: 160 },
        { description: 'Cabinet hardware set', quantity: 1, unit: 'set', unit_price: 240 },
      ]},
      { title: 'Countertops', items: [
        { description: 'Quartz countertop, installed', quantity: 42, unit: 'sqft', unit_price: 78 },
        { description: 'Undermount sink cutout', quantity: 1, unit: 'each', unit_price: 150 },
      ]},
      { title: 'Backsplash', items: [
        { description: 'Subway tile backsplash, installed', quantity: 32, unit: 'sqft', unit_price: 22 },
      ]},
    ],
  },
  {
    clientIdx: 1, name: 'Patio Deck Build', project_type: 'construction',
    status: 'approved', estimateStatus: 'accepted', summary: 'New 240 sqft pressure-treated deck with railing and stairs.',
    sections: [
      { title: 'Framing & Decking', items: [
        { description: 'Pressure-treated framing & joists', quantity: 240, unit: 'sqft', unit_price: 14 },
        { description: 'Composite decking boards, installed', quantity: 240, unit: 'sqft', unit_price: 19 },
      ]},
      { title: 'Railing & Stairs', items: [
        { description: 'Aluminum railing (linear ft)', quantity: 44, unit: 'ft', unit_price: 32 },
        { description: 'Stair set (3 steps)', quantity: 1, unit: 'set', unit_price: 480 },
      ]},
    ],
  },
  {
    clientIdx: 2, name: 'Exterior Repaint — Building C', project_type: 'painting',
    status: 'draft', estimateStatus: 'draft', summary: 'Pressure wash and two-coat exterior repaint for a 3-story apartment building.',
    sections: [
      { title: 'Prep', items: [
        { description: 'Pressure washing', quantity: 4200, unit: 'sqft', unit_price: 0.35 },
        { description: 'Surface prep & masking', quantity: 1, unit: 'job', unit_price: 850 },
      ]},
      { title: 'Paint', items: [
        { description: 'Exterior paint, two coats', quantity: 4200, unit: 'sqft', unit_price: 1.65 },
        { description: 'Trim & accents', quantity: 1, unit: 'job', unit_price: 1200 },
      ]},
    ],
  },
  {
    clientIdx: 3, name: 'HVAC System Replacement', project_type: 'hvac',
    status: 'sent', estimateStatus: 'viewed', summary: 'Replace aging rooftop unit with a high-efficiency 5-ton system.',
    sections: [
      { title: 'Equipment', items: [
        { description: '5-ton high-efficiency rooftop unit', quantity: 1, unit: 'each', unit_price: 6400 },
        { description: 'Programmable thermostat', quantity: 2, unit: 'each', unit_price: 180 },
      ]},
      { title: 'Labor', items: [
        { description: 'Removal & disposal of old unit', quantity: 1, unit: 'job', unit_price: 750 },
        { description: 'Installation & commissioning', quantity: 1, unit: 'job', unit_price: 1900 },
      ]},
    ],
  },
]

const PRICE_BOOK_FOLDERS = ['Carpentry', 'Painting', 'HVAC']
const PRICE_BOOK_ITEMS = [
  { folderIdx: 0, name: 'Shaker base cabinet', unit: 'ft', unit_price: 185 },
  { folderIdx: 0, name: 'Composite decking, installed', unit: 'sqft', unit_price: 19 },
  { folderIdx: 1, name: 'Exterior paint, two coats', unit: 'sqft', unit_price: 1.65 },
  { folderIdx: 1, name: 'Pressure washing', unit: 'sqft', unit_price: 0.35 },
  { folderIdx: 2, name: '5-ton rooftop unit', unit: 'each', unit_price: 6400 },
]

const TAX_RATE = 0.0825 // 8.25% — typical TX sales tax

async function main() {
  console.log(`\nDemo workspace seed`)
  console.log(`  company: ${DEMO_COMPANY_ID}`)
  console.log(`  mode:    ${RESET ? 'RESET + seed' : 'upsert'}${DRY_RUN ? ' (dry-run)' : ''}\n`)

  // Resolve the demo auth user id from email.
  const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (usersErr) fail(`Could not list auth users: ${usersErr.message}`)
  const demoUser = usersPage.users.find(
    (u) => (u.email ?? '').toLowerCase() === DEMO_USER_EMAIL.toLowerCase()
  )
  if (!demoUser) fail(`Demo auth user not found for ${DEMO_USER_EMAIL}. Create it in Supabase Auth first.`)
  const demoUserId = demoUser.id
  console.log(`  demo user: ${DEMO_USER_EMAIL} → ${demoUserId}\n`)

  if (DRY_RUN) {
    console.log('Dry run — would upsert:')
    console.log(`  1 company, ${CLIENTS.length} clients, ${PROJECTS.length} projects + estimates,`)
    console.log(`  ${PRICE_BOOK_FOLDERS.length} price-book folders, ${PRICE_BOOK_ITEMS.length} price-book items,`)
    console.log(`  company_members + demo_config rows.`)
    return
  }

  if (RESET) {
    console.log('Resetting demo data (child rows cascade)…')
    // estimate_items/sections cascade from estimates; estimates cascade from projects.
    await supabase.from('estimates').delete().eq('company_id', DEMO_COMPANY_ID)
    await supabase.from('projects').delete().eq('company_id', DEMO_COMPANY_ID)
    await supabase.from('clients').delete().eq('company_id', DEMO_COMPANY_ID)
    await supabase.from('company_price_book').delete().eq('company_id', DEMO_COMPANY_ID)
    await supabase.from('price_book_folders').delete().eq('company_id', DEMO_COMPANY_ID)
  }

  // 1. Company
  await upsert('companies', {
    id: DEMO_COMPANY_ID,
    user_id: demoUserId,
    name: 'Lone Star Home Services',
    owner_name: 'Sample Account',
    email: 'demo@example.com',
    phone: '+15550199',
    industry: 'general_contractor',
    city: 'Austin', state: 'TX', zip: '78701', address: '500 Congress Ave',
    currency_code: 'USD',
    default_tax_rate: TAX_RATE,
    default_payment_terms: '50% deposit, balance on completion.',
    default_warranty_terms: '1-year workmanship warranty.',
    default_validity_days: 30,
    tier: 'pro',
  })

  // 2. Membership + demo_config (flips on the read-only DB trap for the demo user)
  await upsert('company_members', { company_id: DEMO_COMPANY_ID, user_id: demoUserId, role: 'owner' }, 'company_id,user_id')
  await upsert('demo_config', { user_id: demoUserId, company_id: DEMO_COMPANY_ID }, 'user_id')

  // 3. Clients
  const clientIds = []
  for (let i = 0; i < CLIENTS.length; i++) {
    const id = demoId('c1', i)
    clientIds.push(id)
    await upsert('clients', { id, company_id: DEMO_COMPANY_ID, ...CLIENTS[i] })
  }

  // 4. Price book
  const folderIds = []
  for (let i = 0; i < PRICE_BOOK_FOLDERS.length; i++) {
    const id = demoId('pf', i)
    folderIds.push(id)
    await upsert('price_book_folders', { id, company_id: DEMO_COMPANY_ID, name: PRICE_BOOK_FOLDERS[i], sort_order: i })
  }
  for (let i = 0; i < PRICE_BOOK_ITEMS.length; i++) {
    const it = PRICE_BOOK_ITEMS[i]
    await upsert('company_price_book', {
      id: demoId('pi', i), company_id: DEMO_COMPANY_ID, folder_id: folderIds[it.folderIdx],
      // `category` predates the folder_id FK and is still NOT NULL — mirror the
      // folder name so legacy and folder-based views both render.
      category: PRICE_BOOK_FOLDERS[it.folderIdx],
      name: it.name, unit: it.unit, unit_price: it.unit_price, currency_code: 'USD',
    })
  }

  // 5. Projects + estimates + sections + items
  for (let p = 0; p < PROJECTS.length; p++) {
    const proj = PROJECTS[p]
    const projectId = demoId('pr', p)
    const estimateId = demoId('es', p)

    // Compute totals from sections.
    let subtotal = 0
    const computedSections = proj.sections.map((s) => {
      const items = s.items.map((it) => ({ ...it, total: round(it.quantity * it.unit_price) }))
      const secSub = round(items.reduce((sum, it) => sum + it.total, 0))
      subtotal += secSub
      return { ...s, items, subtotal: secSub }
    })
    subtotal = round(subtotal)
    const taxAmount = round(subtotal * TAX_RATE)
    const total = round(subtotal + taxAmount)

    await upsert('projects', {
      id: projectId, company_id: DEMO_COMPANY_ID, client_id: clientIds[proj.clientIdx],
      name: proj.name, project_type: proj.project_type, status: proj.status,
      input_mode: 'text', total,
    })

    const consolidated = proj.estimateStatus !== 'draft'
    await upsert('estimates', {
      id: estimateId, project_id: projectId, company_id: DEMO_COMPANY_ID,
      currency_code: 'USD', version: 1, is_current: true,
      status: proj.estimateStatus,
      workflow_status: consolidated ? 'consolidated' : 'draft',
      consolidated_at: consolidated ? new Date().toISOString() : null,
      consolidated_by: consolidated ? demoUserId : null,
      summary: proj.summary,
      payment_terms: '50% deposit, balance on completion.',
      warranty_terms: '1-year workmanship warranty.',
      share_token: `demo-${p + 1}`,
      subtotal, discount_value: 0, discount_amount: 0,
      tax_rate: TAX_RATE, tax_amount: taxAmount, total,
      sent_at: ['sent', 'viewed', 'accepted'].includes(proj.estimateStatus) ? new Date().toISOString() : null,
      viewed_at: ['viewed', 'accepted'].includes(proj.estimateStatus) ? new Date().toISOString() : null,
    })

    for (let s = 0; s < computedSections.length; s++) {
      const sec = computedSections[s]
      const sectionId = demoId(`s${p}`, s)
      await upsert('estimate_sections', {
        id: sectionId, estimate_id: estimateId, company_id: DEMO_COMPANY_ID,
        title: sec.title, sort_order: s, subtotal: sec.subtotal,
      })
      for (let it = 0; it < sec.items.length; it++) {
        const item = sec.items[it]
        await upsert('estimate_items', {
          id: demoId(`i${p}${s}`, it), section_id: sectionId, company_id: DEMO_COMPANY_ID,
          description: item.description, quantity: item.quantity, unit: item.unit,
          unit_price: item.unit_price, total: item.total, sort_order: it, price_source: 'ai_estimate',
        })
      }
    }
    console.log(`  ✓ project "${proj.name}" — $${total.toLocaleString()}`)
  }

  console.log('\n✓ Demo workspace seeded.\n')
}

async function upsert(table, row, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(row, { onConflict })
  if (error) fail(`upsert ${table} failed: ${error.message}`)
}

main().catch((e) => fail(e?.message ?? String(e)))
