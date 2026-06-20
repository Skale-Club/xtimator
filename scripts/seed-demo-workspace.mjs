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
// The group label is hashed to hex because UUID segments must be valid hex —
// raw labels like "pf"/"es"/"s0" contain non-hex chars and Postgres rejects them.
// The full 32-bit group hash spans <grp> + the first 4 hex of the sequence, with
// n in the trailing 8 hex, so distinct (group, n) pairs never collide.
function demoId(group, n) {
  let h = 0
  const s = String(group)
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
  const g = (h & 0xffff).toString(16).padStart(4, '0')
  const seq =
    ((h >>> 16) & 0xffff).toString(16).padStart(4, '0') +
    Number(n).toString(16).padStart(8, '0')
  return `0000de00-0000-0000-${g}-${seq}`
}

const round = (v) => Math.round(v * 100) / 100

// ---------------------------------------------------------------------------
// Fictional dataset — coherent across clients → projects → estimates.
// ---------------------------------------------------------------------------
const CLIENTS = [
  { name: 'Maple Street Residence', email: 'owner@example.com', phone: '+15550100', city: 'Everett', state: 'MA', zip: '02149', address: '124 Maple St' },
  { name: 'Harbor View Apartments', email: 'pm@example.com', phone: '+15550101', city: 'Chelsea', state: 'MA', zip: '02150', address: '9 Harbor View Ln' },
  { name: 'Bright Smile Dental', email: 'office@example.com', phone: '+15550102', city: 'Malden', state: 'MA', zip: '02148', address: '450 Pleasant St' },
  { name: 'The Cozy Cafe', email: 'manager@example.com', phone: '+15550103', city: 'Somerville', state: 'MA', zip: '02143', address: '88 Highland Ave' },
]

// Each project belongs to clients[clientIdx] and carries one consolidated estimate.
const PROJECTS = [
  {
    clientIdx: 0, name: 'Whole-Home Carpet Cleaning', project_type: 'cleaning',
    status: 'sent', estimateStatus: 'sent', summary: 'Hot water extraction for five carpeted rooms, stairs, and hallway, with pet treatment and fabric protector.',
    sections: [
      { title: 'Carpet Cleaning', items: [
        { description: 'Carpet cleaning — per room', quantity: 5, unit: 'room', unit_price: 50 },
        { description: 'Carpeted stairs (per step)', quantity: 13, unit: 'step', unit_price: 3 },
        { description: 'Hallway cleaning', quantity: 1, unit: 'each', unit_price: 25 },
      ]},
      { title: 'Treatments', items: [
        { description: 'Pet odor / enzyme treatment (per room)', quantity: 2, unit: 'room', unit_price: 40 },
        { description: 'Scotchgard / fabric protector (per room)', quantity: 5, unit: 'room', unit_price: 40 },
      ]},
    ],
  },
  {
    clientIdx: 0, name: 'Living Room Upholstery Refresh', project_type: 'cleaning',
    status: 'approved', estimateStatus: 'accepted', summary: 'Deep clean of sofa, loveseat, and armchairs with spot treatment.',
    sections: [
      { title: 'Upholstery Cleaning', items: [
        { description: 'Sofa cleaning — 3-seat', quantity: 1, unit: 'each', unit_price: 150 },
        { description: 'Loveseat cleaning — 2-seat', quantity: 1, unit: 'each', unit_price: 105 },
        { description: 'Armchair cleaning', quantity: 2, unit: 'each', unit_price: 60 },
      ]},
      { title: 'Treatments', items: [
        { description: 'Stain / spot treatment (per area)', quantity: 2, unit: 'each', unit_price: 25 },
      ]},
    ],
  },
  {
    clientIdx: 1, name: 'Move-Out Carpet Cleaning — Unit 4B', project_type: 'cleaning',
    status: 'draft', estimateStatus: 'draft', summary: 'Full carpet clean for a vacated apartment ahead of new tenant move-in.',
    sections: [
      { title: 'Carpet Cleaning', items: [
        { description: 'Carpet cleaning — per sqft (hot water extraction)', quantity: 850, unit: 'sqft', unit_price: 0.35 },
        { description: 'Closet / small area cleaning', quantity: 2, unit: 'each', unit_price: 20 },
      ]},
      { title: 'Add-ons', items: [
        { description: 'Deodorizer treatment (per room)', quantity: 3, unit: 'room', unit_price: 30 },
      ]},
    ],
  },
  {
    clientIdx: 3, name: 'Cafe Carpet & Dining Chairs', project_type: 'cleaning',
    status: 'sent', estimateStatus: 'viewed', summary: 'Commercial carpet cleaning for the dining area plus upholstered dining chairs.',
    sections: [
      { title: 'Carpet Cleaning', items: [
        { description: 'Carpet cleaning — per sqft (hot water extraction)', quantity: 1200, unit: 'sqft', unit_price: 0.35 },
      ]},
      { title: 'Upholstery Cleaning', items: [
        { description: 'Dining chair cleaning', quantity: 12, unit: 'each', unit_price: 25 },
      ]},
      { title: 'Labor', items: [
        { description: 'Service-call / minimum charge', quantity: 1, unit: 'each', unit_price: 99 },
      ]},
    ],
  },
]

const PRICE_BOOK_FOLDERS = ['Carpet Cleaning', 'Upholstery Cleaning', 'Mattresses & Specialty Rugs', 'Treatments & Add-ons', 'Labor & Trip']
const PRICE_BOOK_ITEMS = [
  // Carpet Cleaning
  { folderIdx: 0, name: 'Carpet cleaning — per room', unit: 'room', unit_price: 50 },
  { folderIdx: 0, name: 'Carpet cleaning — per sqft (hot water extraction)', unit: 'sqft', unit_price: 0.35 },
  { folderIdx: 0, name: 'Hallway cleaning', unit: 'each', unit_price: 25 },
  { folderIdx: 0, name: 'Carpeted stairs (per step)', unit: 'step', unit_price: 3 },
  { folderIdx: 0, name: 'Whole-house carpet cleaning minimum', unit: 'each', unit_price: 199 },
  { folderIdx: 0, name: 'Closet / small area cleaning', unit: 'each', unit_price: 20 },
  // Upholstery Cleaning
  { folderIdx: 1, name: 'Armchair cleaning', unit: 'each', unit_price: 60 },
  { folderIdx: 1, name: 'Recliner cleaning', unit: 'each', unit_price: 75 },
  { folderIdx: 1, name: 'Loveseat cleaning — 2-seat', unit: 'each', unit_price: 105 },
  { folderIdx: 1, name: 'Sofa cleaning — 3-seat', unit: 'each', unit_price: 150 },
  { folderIdx: 1, name: 'Sectional cleaning (per seat)', unit: 'seat', unit_price: 45 },
  { folderIdx: 1, name: 'Dining chair cleaning', unit: 'each', unit_price: 25 },
  { folderIdx: 1, name: 'Ottoman cleaning', unit: 'each', unit_price: 40 },
  { folderIdx: 1, name: 'Leather conditioning / cleaning (per seat)', unit: 'seat', unit_price: 65 },
  // Mattresses & Specialty Rugs
  { folderIdx: 2, name: 'Mattress cleaning — Twin', unit: 'each', unit_price: 60 },
  { folderIdx: 2, name: 'Mattress cleaning — Queen', unit: 'each', unit_price: 100 },
  { folderIdx: 2, name: 'Mattress cleaning — King', unit: 'each', unit_price: 130 },
  { folderIdx: 2, name: 'Area rug cleaning (per sqft)', unit: 'sqft', unit_price: 4 },
  { folderIdx: 2, name: 'Oriental / wool rug cleaning (per sqft)', unit: 'sqft', unit_price: 6 },
  { folderIdx: 2, name: 'Tile & grout cleaning (per sqft)', unit: 'sqft', unit_price: 1.5 },
  // Treatments & Add-ons
  { folderIdx: 3, name: 'Stain / spot treatment (per area)', unit: 'each', unit_price: 25 },
  { folderIdx: 3, name: 'Pet odor / enzyme treatment (per room)', unit: 'room', unit_price: 40 },
  { folderIdx: 3, name: 'Scotchgard / fabric protector (per room)', unit: 'room', unit_price: 40 },
  { folderIdx: 3, name: 'Deodorizer treatment (per room)', unit: 'room', unit_price: 30 },
  { folderIdx: 3, name: 'Carpet stretching (per room)', unit: 'room', unit_price: 150 },
  { folderIdx: 3, name: 'Carpet patch / repair (per repair)', unit: 'each', unit_price: 200 },
  // Labor & Trip
  { folderIdx: 4, name: 'Service-call / minimum charge', unit: 'each', unit_price: 99 },
  { folderIdx: 4, name: 'Technician labor (per hour)', unit: 'hr', unit_price: 75 },
  { folderIdx: 4, name: 'Trip / travel fee (out-of-area)', unit: 'each', unit_price: 35 },
  { folderIdx: 4, name: 'After-hours / emergency surcharge', unit: 'each', unit_price: 75 },
]

// Cleaning services are generally not subject to sales tax in MA.
const TAX_RATE = 0

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
    name: 'Xcleaning Co',
    // owner_name left null so the dashboard greeting reads "Welcome back, Xcleaning Co".
    owner_name: null,
    email: 'demo@example.com',
    phone: '+15550199',
    industry: 'upholstery_carpet_cleaning',
    industries: ['upholstery_carpet_cleaning'],
    city: 'Everett', state: 'MA', zip: '02149', address: '100 Broadway',
    currency_code: 'USD',
    default_tax_rate: TAX_RATE,
    default_payment_terms: 'Payment due upon completion.',
    default_warranty_terms: '100% satisfaction guarantee — we re-clean free if you are not happy.',
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
      estimate_seq: p + 1,
      currency_code: 'USD', version: 1, is_current: true,
      status: proj.estimateStatus,
      workflow_status: consolidated ? 'consolidated' : 'draft',
      consolidated_at: consolidated ? new Date().toISOString() : null,
      consolidated_by: consolidated ? demoUserId : null,
      summary: proj.summary,
      payment_terms: '50% deposit, balance on completion.',
      warranty_terms: '1-year workmanship warranty.',
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
