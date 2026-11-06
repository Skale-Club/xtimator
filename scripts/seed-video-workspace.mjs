/**
 * Fictional field-service data for an EXISTING recording company.
 * Dry run: node --env-file=.env.local scripts/seed-video-workspace.mjs --email=<email> --company-id=<uuid>
 * Apply: append --apply. Verify an existing seed: append --verify.
 * Before-state snapshots go to gitignored .bg-shell/video-workspace/.
 * No Auth, AI, delivery, Stripe or notification APIs are invoked.
 */
import pg from 'pg'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const EMAIL = option('email')
const COMPANY = option('company-id')
const APPLY = args.includes('--apply')
const VERIFY = args.includes('--verify')
const SEED = 'field-services-video-v1'
const AS_OF = '2026-11-06T12:00:00.000Z'
const day = (daysAgo, hour = 15) => {
  const date = new Date(AS_OF)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  date.setUTCHours(hour)
  return date.toISOString()
}
const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const id = key => {
  const hex = createHash('sha256').update(`${SEED}:${COMPANY}:${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// Illustrative prices for tutorials, not a regional price guide or tax advice.
const GROUPS = [
  ['Remodeling & Construction', [
    ['demo', 'Selective demolition and debris removal', 'job', 850],
    ['framing', 'Non-load-bearing partition framing', 'lf', 28],
    ['drywall', 'Drywall installation and finish, ready for paint', 'sqft', 3.75],
    ['tile', 'Porcelain tile installation — labor and setting materials', 'sqft', 14],
    ['backsplash', 'Kitchen backsplash tile installation', 'sqft', 22],
    ['vanity', 'Bathroom vanity installation — owner-supplied fixture', 'each', 650],
    ['waterproof', 'Shower waterproofing system', 'job', 1250],
    ['finish', 'Finish carpentry and punch-list completion', 'hr', 85],
  ]],
  ['Painting & Drywall Repairs', [
    ['paint', 'Interior wall preparation and two finish coats', 'sqft', 2.25],
    ['ceiling', 'Ceiling preparation and two finish coats', 'sqft', 1.85],
    ['trim', 'Baseboard and casing preparation and painting', 'lf', 3.5],
    ['doorpaint', 'Interior door preparation and painting', 'each', 125],
    ['patch', 'Drywall patch and texture blend', 'each', 145],
    ['exterior', 'Exterior trim scraping, priming and painting', 'lf', 7.5],
    ['protect', 'Furniture protection, masking and daily cleanup', 'job', 225],
  ]],
  ['House Cleaning', [
    ['deep', 'Residential deep cleaning', 'sqft', 0.18],
    ['regular', 'Recurring home cleaning — standard visit', 'visit', 180],
    ['moveout', 'Move-out cleaning including cabinets and closets', 'sqft', 0.22],
    ['oven', 'Interior oven cleaning', 'each', 45],
    ['fridge', 'Interior refrigerator cleaning', 'each', 40],
    ['windows', 'Interior window glass and sill cleaning', 'each', 12],
    ['bathclean', 'Additional bathroom detail cleaning', 'each', 55],
  ]],
  ['Carpet & Upholstery', [
    ['carpet', 'Carpet hot-water extraction cleaning', 'room', 55],
    ['carpetsq', 'Commercial carpet hot-water extraction', 'sqft', 0.32],
    ['stairs', 'Carpeted stair cleaning', 'step', 4],
    ['sofa', 'Three-seat sofa deep cleaning', 'each', 165],
    ['chair', 'Upholstered armchair cleaning', 'each', 65],
    ['rug', 'Synthetic area rug cleaning', 'sqft', 3.5],
    ['pet', 'Pet odor enzyme treatment', 'room', 35],
    ['fabric', 'Fabric protector application', 'each', 45],
  ]],
  ['Commercial & Post-Construction Cleaning', [
    ['office', 'Office detail cleaning', 'sqft', 0.12],
    ['postclean', 'Post-construction fine dust and surface cleaning', 'sqft', 0.4],
    ['floor', 'Hard-floor machine scrub and finish', 'sqft', 0.3],
    ['restroom', 'Commercial restroom deep cleaning', 'each', 95],
    ['glass', 'Interior glass partition cleaning', 'panel', 18],
    ['debris', 'Final construction debris collection', 'job', 175],
  ]],
  ['Electrical & Lighting', [
    ['panel', '200-amp electrical panel replacement — standard access', 'job', 2450],
    ['permit', 'Permit and inspection coordination allowance', 'job', 275],
    ['surge', 'Whole-home surge protector installation', 'each', 325],
    ['ev', 'Level 2 EV charger installation — owner-supplied charger', 'job', 950],
    ['circuit', 'Dedicated 240V branch circuit, up to 30 ft', 'job', 650],
    ['light', 'LED recessed light installation', 'each', 225],
    ['gfci', 'GFCI receptacle replacement', 'each', 185],
  ]],
  ['Plumbing & Home Maintenance', [
    ['heater', '50-gallon electric water heater replacement', 'job', 1850],
    ['expansion', 'Expansion tank and isolation valve installation', 'job', 250],
    ['haul', 'Old fixture or appliance haul-away', 'each', 125],
    ['faucet', 'Faucet replacement — owner-supplied fixture', 'each', 225],
    ['caulk', 'Bathroom silicone removal and reseal', 'lf', 8],
    ['repair', 'General home maintenance labor', 'hr', 85],
  ]],
  ['Decks & Landscape Maintenance', [
    ['deckboard', 'Pressure-treated deck board replacement', 'sqft', 18],
    ['rail', 'Deck railing repair and reinforcement', 'lf', 32],
    ['stain', 'Deck cleaning, preparation and stain', 'sqft', 4.5],
    ['mulch', 'Mulch supply and installation', 'yard', 125],
    ['leaves', 'Fall leaf removal and yard cleanup', 'job', 325],
    ['hedges', 'Hedge shaping and pruning', 'hr', 75],
    ['yardhaul', 'Yard waste hauling', 'load', 150],
  ]],
]
const CATALOG = Object.fromEntries(GROUPS.flatMap(([folder, items]) => items.map(([key, name, unit, price]) => [key, { key, name, unit, price, folder }])))
const CLIENTS = [
  ['Emma & Daniel Carter', 'emma.carter', 'Woburn', '01801', 'Residential homeowner; prefers a written scope and a clear daily work schedule.'],
  ['Michael Bennett', 'michael.bennett', 'Medford', '02155', 'Returning homeowner; garage access available after 9 AM.'],
  ['Olivia Martinez', 'olivia.martinez', 'Melrose', '02176', 'Move-out service; coordinate key handoff before the appointment.'],
  ['Sophia Chen', 'sophia.chen', 'Somerville', '02143', 'Owner-occupied home; protect hardwood floors and keep pathways clear.'],
  ['James Wilson', 'james.wilson', 'Arlington', '02474', 'Returning carpet cleaning client; has one dog.'],
  ['Ava Thompson', 'ava.thompson', 'Winchester', '01890', 'Prefers morning appointments and low-odor cleaning products.'],
  ['Harborview Property Management', 'service.harborview', 'Malden', '02148', 'Property manager; each unit requires a separate estimate and completion checklist.'],
  ['Maple Street Dental', 'office.mapledental', 'Everett', '02149', 'Commercial office; work after business hours and secure the premises on completion.'],
  ['The Corner Table Cafe', 'manager.cornertable', 'Cambridge', '02139', 'Commercial client; protect food preparation areas and schedule before opening.'],
  ['Lucas & Isabella Brooks', 'lucas.brooks', 'Stoneham', '02180', 'Bathroom remodel; finish selections supplied by homeowner.'],
  ['Noah Anderson', 'noah.anderson', 'Wakefield', '01880', 'EV installation; charger supplied by homeowner and mounted in garage.'],
  ['Grace Robinson', 'grace.robinson', 'Reading', '01867', 'Seasonal exterior maintenance and fall cleanup.'],
]
// client, name, project type, lifecycle, creation days ago, sections, scope, schedule.
const JOBS = [
  [9, 'Guest Bathroom Remodel', 'Bathroom Remodel', 'paid', 56, [['Demolition & Preparation', [['demo', 1], ['waterproof', 1]]], ['Installation', [['tile', 180], ['vanity', 1], ['drywall', 140]]], ['Finishing', [['paint', 220], ['finish', 8], ['caulk', 35]]]], 'Refresh the guest bathroom with a tiled shower surround, porcelain floor, new vanity and painted walls. Owner supplies tile, vanity and finish fixtures. Structural changes and concealed damage are excluded.', '8–10 working days after finish materials arrive.'],
  [0, 'Kitchen Backsplash & Under-Cabinet Lighting', 'Kitchen Remodel', 'accepted', 24, [['Tile Preparation & Installation', [['protect', 1], ['backsplash', 58], ['patch', 2]]], ['Lighting & Finish', [['light', 4], ['finish', 4]]]], 'Install a subway-tile backsplash and update task lighting. Existing layout and cabinetry remain. Confirm grout color and fixture placement before starting.', '3 working days; coordinate electrical and tile visits.'],
  [1, 'Backyard Deck Repair & Staining', 'Decks & Porches', 'viewed', 11, [['Deck Repairs', [['deckboard', 120], ['rail', 32], ['finish', 6]]], ['Preparation & Stain', [['stain', 340], ['haul', 1]]]], 'Replace deteriorated deck boards, reinforce loose railing sections, wash and stain the deck. Existing footings and framing assumed sound pending site inspection.', '4–5 working days, weather permitting.'],
  [3, 'First-Floor Interior Painting', 'Interior Painting', 'viewed', 8, [['Protection & Wall Repairs', [['protect', 1], ['patch', 6]]], ['Walls & Ceilings', [['paint', 1750], ['ceiling', 700]]], ['Doors & Trim', [['trim', 240], ['doorpaint', 5]]]], 'Prepare and repaint the living room, dining room, entry and hallway. Includes minor nail-hole repairs and two finish coats. Color selections to be approved before materials are ordered.', '5 working days; one room completed at a time.'],
  [5, 'Two-Bedroom Color Refresh', 'Interior Painting', 'draft', 1, [['Surface Preparation', [['protect', 1], ['patch', 3]]], ['Painting', [['paint', 760], ['ceiling', 260], ['trim', 110], ['doorpaint', 2]]]], 'Repaint two bedrooms in owner-selected neutral colors. Protect furniture and floors; exclude wallpaper removal and major substrate repairs.', '2–3 working days after color approval.'],
  [11, 'Exterior Trim & Entry Door Refresh', 'Exterior Painting', 'paid', 42, [['Preparation', [['protect', 1], ['repair', 5]]], ['Exterior Finishes', [['exterior', 260], ['doorpaint', 2]]]], 'Scrape loose paint, spot-prime bare wood and apply two finish coats to accessible exterior trim. Refinish two entry door surfaces. Lead abatement and rotten wood replacement are excluded.', '3 working days in suitable dry weather.'],
  [2, 'Move-Out Deep Clean — Two-Bedroom Apartment', 'Move-In/Out', 'paid', 34, [['Apartment Cleaning', [['moveout', 1450]]], ['Kitchen & Glass', [['oven', 1], ['fridge', 1], ['windows', 8]]]], 'Complete an empty-apartment move-out clean, including accessible cabinet interiors, bathrooms, appliance interiors and interior glass. Utilities must remain on.', 'One visit with a two-person crew.'],
  [5, 'Whole-Home Deep Cleaning', 'Deep Cleaning', 'viewed', 5, [['Detailed Home Cleaning', [['deep', 1900]]], ['Add-On Services', [['oven', 1], ['fridge', 1], ['windows', 10]]]], 'Initial detailed cleaning of a three-bedroom home with kitchen, two bathrooms and common areas. Includes reachable surfaces; excludes exterior glass and hazardous cleanup.', 'One full-day service visit.'],
  [3, 'Biweekly Home Cleaning — Initial Visit', 'Recurring Service', 'draft', 0, [['Routine Cleaning', [['regular', 1]]], ['First-Visit Add-Ons', [['oven', 1], ['bathclean', 1]]]], 'Standard recurring cleaning of kitchen, bathrooms, bedrooms and living areas. This estimate covers the initial visit only; future visits will be scheduled separately.', 'Every other Friday, subject to schedule confirmation.'],
  [7, 'Dental Office — After-Hours Detail Clean', 'Commercial Cleaning', 'sent', 6, [['Office & Restrooms', [['office', 2800], ['restroom', 3]]], ['Floor & Glass Care', [['floor', 650], ['glass', 8]]]], 'After-hours cleaning of reception, non-clinical work areas, restrooms and hard floors. Clinical instruments, medical waste and sterilization areas are excluded.', 'One evening after office closure.'],
  [4, 'Five-Room Carpet & Stair Cleaning', 'Carpet Cleaning', 'accepted', 19, [['Carpet Extraction', [['carpet', 5], ['stairs', 13]]], ['Treatments', [['pet', 2], ['fabric', 3]]]], 'Hot-water extraction for five carpeted rooms and one staircase. Apply pet odor treatment in two rooms and fabric protection in three rooms. Permanent stain removal is not guaranteed.', 'One morning visit; allow drying time before moving furniture.'],
  [8, 'Cafe Seating & Area Rug Refresh', 'Upholstery Cleaning', 'viewed', 4, [['Upholstery', [['sofa', 1], ['chair', 6]]], ['Area Rug & Protection', [['rug', 64], ['fabric', 7]]]], 'Deep-clean the lounge sofa, six upholstered chairs and synthetic area rug. Test fabric colorfastness first. Service scheduled outside dining hours.', 'One early-morning visit before opening.'],
  [6, 'Renovated Condo — Post-Construction Cleaning', 'Post-Construction', 'draft', 2, [['Final Construction Cleaning', [['postclean', 2100], ['debris', 1]]], ['Glass & Floor Detailing', [['windows', 14], ['floor', 450]]]], 'Remove fine construction dust from accessible surfaces, detail floors and clean interior glass following renovation. Construction work must be complete before final cleaning.', 'Two-person crew for 1–2 days after contractor handoff.'],
  [1, '200-Amp Panel Upgrade & Surge Protection', 'Panel Upgrade', 'paid', 48, [['Electrical Equipment', [['panel', 1], ['surge', 1]]], ['Permits & Finish', [['permit', 1], ['patch', 1]]]], 'Replace the existing electrical panel with a 200-amp panel and install whole-home surge protection. Subject to utility service capacity and permit approval. Service mast and underground feeder replacement excluded.', 'One installation day plus utility and inspection scheduling.'],
  [10, 'Garage Level 2 EV Charger Installation', 'EV Charger', 'sent', 3, [['Electrical Installation', [['ev', 1], ['circuit', 1]]], ['Inspection & Making Good', [['permit', 1], ['patch', 1]]]], 'Install an owner-supplied Level 2 charger in the garage with a dedicated 240V circuit up to 30 feet. Verify load capacity before installation. Panel upgrades and trenching are excluded.', 'One installation day after permit and load review.'],
  [0, 'Water Heater Replacement & Utility Room Repairs', 'Water Heater', 'draft', 1, [['Water Heater Replacement', [['heater', 1], ['expansion', 1], ['haul', 1]]], ['Utility Room Repairs', [['repair', 2], ['caulk', 12]]]], 'Replace an existing 50-gallon electric water heater, add an expansion tank and isolation valve, and make minor utility room repairs. No fuel conversion or major electrical upgrades included.', 'One working day after equipment availability is confirmed.'],
  [11, 'Fall Yard Cleanup & Mulch Installation', 'Lawn Care', 'paid', 28, [['Landscape Maintenance', [['leaves', 1], ['hedges', 4], ['mulch', 5]]], ['Waste Removal', [['yardhaul', 2]]]], 'Collect leaves, shape existing hedges, install five cubic yards of mulch and haul yard waste. Tree removal and new planting are excluded.', 'One to two working days, weather permitting.'],
  [6, 'Rental Unit 3B — Drywall & Turnover Repairs', 'Drywall', 'ready', 2, [['Drywall Repairs', [['patch', 6], ['drywall', 96]]], ['Finish & Touch-Up', [['paint', 160], ['repair', 3]]]], 'Repair tenant-related wall damage, replace a small drywall area and repaint affected wall surfaces in Unit 3B. Existing paint match is approximate; full-room repainting priced separately if required.', '2 working days before the new tenant moves in.'],
  [4, 'Living Room Rug & Upholstery Cleaning', 'Upholstery Cleaning', 'declined', 16, [['Upholstery Cleaning', [['sofa', 1], ['chair', 2]]], ['Area Rug Care', [['rug', 80], ['fabric', 3]]]], 'Clean one sofa, two armchairs and an 8-by-10-foot synthetic rug. Customer postponed this optional service to a later season.', 'One half-day service appointment.'],
]

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 12000, statement_timeout: 20000 })
const tables = {}
function add(table, row) { (tables[table] ??= []).push(row) }
async function insert(table, row) {
  const cols = Object.keys(row)
  await db.query(`INSERT INTO public."${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row))
}
async function verify() {
  const { rows: [counts] } = await db.query(`SELECT
    (SELECT count(*)::int FROM projects WHERE company_id=$1 AND archived_at IS NULL AND deleted_at IS NULL) AS active_projects,
    (SELECT count(*)::int FROM clients WHERE company_id=$1 AND id=ANY($2::uuid[])) AS seeded_clients,
    (SELECT count(*)::int FROM estimates WHERE company_id=$1 AND id=ANY($3::uuid[])) AS seeded_estimates,
    (SELECT count(*)::int FROM estimates WHERE company_id=$1 AND id=ANY($3::uuid[]) AND client_response='accepted') AS accepted,
    (SELECT count(*)::int FROM estimates WHERE company_id=$1 AND id=ANY($3::uuid[]) AND payment_status='paid') AS paid,
    (SELECT coalesce(sum(total),0) FROM estimates WHERE company_id=$1 AND id=ANY($3::uuid[]) AND client_response='accepted') AS accepted_value,
    (SELECT count(*)::int FROM company_price_book WHERE company_id=$1 AND deleted_at IS NULL) AS active_catalogue`, [COMPANY, CLIENTS.map((_, i) => id(`client:${i}`)), JOBS.map((_, i) => id(`estimate:${i}`))])
  const { rows: badMath } = await db.query(`SELECT e.id FROM estimates e JOIN projects p ON p.id=e.project_id
    JOIN estimate_sections s ON s.estimate_id=e.id JOIN estimate_items i ON i.section_id=s.id
    WHERE e.company_id=$1 AND e.id=ANY($2::uuid[]) GROUP BY e.id,p.total
    HAVING abs(sum(i.total)-e.subtotal)>0.005 OR abs(e.total-e.subtotal+e.discount_amount-e.tax_amount)>0.005 OR p.total<>e.total`, [COMPANY, JOBS.map((_, i) => id(`estimate:${i}`))])
  if (counts.active_projects !== JOBS.length || counts.seeded_clients !== CLIENTS.length || counts.seeded_estimates !== JOBS.length || counts.active_catalogue !== Object.keys(CATALOG).length || badMath.length) throw new Error('Seed verification failed: counts or totals differ')
  const { rows: [invalid] } = await db.query(`SELECT count(*)::int AS count FROM estimates e JOIN projects p ON p.id=e.project_id
    WHERE e.company_id=$1 AND e.id=ANY($2::uuid[]) AND (p.client_id IS NULL OR e.sent_at<e.created_at OR e.viewed_at<e.sent_at OR e.responded_at<e.viewed_at OR e.paid_at<e.responded_at OR e.stripe_payment_intent_id IS NOT NULL OR e.stripe_checkout_session_id IS NOT NULL)`, [COMPANY, JOBS.map((_, i) => id(`estimate:${i}`))])
  if (invalid.count) throw new Error('Seed relationships or lifecycle verification failed')
  return counts
}

async function protectedState() {
  // Hash in memory only: include billing/integrations/identity without logging secrets.
  const { rows } = await db.query(`SELECT
    to_jsonb(c)-ARRAY['industry','industries','default_payment_terms','default_warranty_terms','default_validity_days'] AS company,
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.user_id) FROM company_members m WHERE m.company_id=c.id) AS memberships,
    (SELECT jsonb_agg(to_jsonb(a)) FROM platform_admins a WHERE a.user_id=c.user_id) AS admins,
    (SELECT jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,'email_confirmed_at',u.email_confirmed_at) FROM auth.users u WHERE u.id=c.user_id) AS identity
    FROM companies c WHERE c.id=$1`,[COMPANY])
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

async function main() {
  if (!EMAIL || !/^[0-9a-f-]{36}$/i.test(COMPANY ?? '') || !process.env.DATABASE_URL || (APPLY && VERIFY)) throw new Error('Pass --email and --company-id with DATABASE_URL; choose --apply OR --verify')
  await db.connect()
  try {
    await db.query(APPLY ? 'BEGIN' : 'BEGIN READ ONLY')
    if (APPLY) await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${SEED}:${COMPANY}`])
    const { rows: [account] } = await db.query(`SELECT c.id,c.name,c.user_id FROM companies c JOIN company_members m ON m.company_id=c.id AND m.user_id=c.user_id
      JOIN auth.users u ON u.id=c.user_id WHERE c.id=$1 AND lower(u.email)=lower($2) AND m.role='owner'`, [COMPANY, EMAIL])
    if (!account) throw new Error('Exact account/company ownership check failed')
    if (VERIFY) { console.log(JSON.stringify({mode:'verify', company:account.name, result:await verify()}, null, 2)); await db.query('ROLLBACK'); return }
    const { rows: existingSeed } = await db.query('SELECT id FROM projects WHERE id=ANY($1::uuid[])', [JOBS.map((_, i) => id(`project:${i}`))])
    if (existingSeed.length) throw new Error('Seed already exists; use --verify. Refusing to overwrite subsequent tutorial edits.')
    const { rows: folders } = await db.query('SELECT * FROM price_book_folders WHERE company_id=$1 ORDER BY name,id', [COMPANY])
    if (folders.length > GROUPS.length) throw new Error('More existing folders than replacement categories; manual review required')
    const snapshot = { seed:SEED, asOf:AS_OF, companyId:COMPANY, databaseHost:new URL(process.env.DATABASE_URL).hostname, company:(await db.query('SELECT industry,industries,default_payment_terms,default_warranty_terms,default_validity_days FROM companies WHERE id=$1',[COMPANY])).rows[0], projects:(await db.query('SELECT id,archived_at FROM projects WHERE company_id=$1 AND archived_at IS NULL AND deleted_at IS NULL',[COMPANY])).rows, catalogue:(await db.query('SELECT id,deleted_at FROM company_price_book WHERE company_id=$1 AND deleted_at IS NULL',[COMPANY])).rows, folders }
    snapshot.protectedHash=await protectedState()
    CLIENTS.forEach(([name, email, city, zip, notes], i) => add('clients', {id:id(`client:${i}`),company_id:COMPANY,name,email:`${email}@example.com`,phone:`+161755501${String(i).padStart(2,'0')}`,city,state:'MA',zip,notes,created_at:day(85-i*3),updated_at:day(85-i*3)}))
    GROUPS.forEach(([name], i) => { const folderId=folders[i]?.id ?? id(`folder:${i}`); add('price_book_folders',{id:folderId,company_id:COMPANY,name,sort_order:i}); Object.values(CATALOG).filter(x=>x.folder===name).forEach(item=>add('company_price_book',{id:id(`catalogue:${item.key}`),company_id:COMPANY,folder_id:folderId,name:item.name,unit:item.unit,unit_price:item.price,currency_code:'USD',notes:'Illustrative tutorial pricing; confirm actual job conditions before quoting.'})) })
    JOBS.forEach(([client, name, type, lifecycle, age, sections, summary, timeline], index) => {
      const projectId=id(`project:${index}`), estimateId=id(`estimate:${index}`)
      let subtotal=0
      sections.forEach(([title, items], sectionIndex) => {
        const sectionId=id(`section:${index}:${sectionIndex}`)
        const sectionTotal=money(items.reduce((sum,[key,quantity])=>sum+money(CATALOG[key].price*quantity),0));subtotal=money(subtotal+sectionTotal)
        add('estimate_sections',{id:sectionId,estimate_id:estimateId,company_id:COMPANY,title,sort_order:sectionIndex,subtotal:sectionTotal})
        items.forEach(([key,quantity], itemIndex)=>{const item=CATALOG[key];add('estimate_items',{id:id(`item:${index}:${sectionIndex}:${itemIndex}`),section_id:sectionId,company_id:COMPANY,description:item.name,quantity,unit:item.unit,unit_price:item.price,total:money(quantity*item.price),sort_order:itemIndex,price_source:'price_book',taxable:false,discount:0})})
      })
      const sent=!['draft','ready'].includes(lifecycle), viewed=['viewed','accepted','paid','declined'].includes(lifecycle), accepted=['accepted','paid'].includes(lifecycle), responded=accepted||lifecycle==='declined'
      const created=day(age,8), sentAt=sent?day(age-1,15):null, viewedAt=viewed?day(age-1,18):null, respondedAt=responded?day(age-2,16):null, paidAt=lifecycle==='paid'?day(age-7,17):null
      add('projects',{id:projectId,company_id:COMPANY,client_id:id(`client:${client}`),name,project_type:type,status:accepted?'approved':lifecycle==='declined'?'declined':sent?'sent':lifecycle==='ready'?'estimate_ready':'draft',input_mode:'text',total:subtotal,target_budget:Math.ceil(subtotal/100)*100,created_at:created,updated_at:paidAt??respondedAt??viewedAt??sentAt??created})
      add('estimates',{id:estimateId,project_id:projectId,company_id:COMPANY,version:1,is_current:true,status:accepted?'accepted':lifecycle==='declined'?'declined':viewed?'viewed':sent?'sent':'draft',summary,timeline,notes:'Confirm access, material selections and final scope before scheduling. Any additional work requires a written change order.',payment_terms:'Payment due upon completion unless a written deposit schedule is agreed before work begins.',warranty_terms:'Workmanship concerns must be reported promptly. Manufacturer warranties apply to supplied products; cleaning results depend on existing material condition.',subtotal,discount_value:0,discount_amount:0,tax_rate:0,tax_amount:0,total:subtotal,currency_code:'USD',language:'en',estimate_date:created.slice(0,10),estimate_number:`SK-${String(1041+index).padStart(4,'0')}`,created_by_user_id:account.user_id,created_at:created,updated_at:paidAt??respondedAt??viewedAt??sentAt??created,sent_at:sentAt,viewed_at:viewedAt,last_viewed_at:viewedAt,view_count:viewed?2+index%4:0,responded_at:respondedAt,client_response:accepted?'accepted':lifecycle==='declined'?'declined':null,payment_status:paidAt?'paid':'unpaid',payment_amount_cents:paidAt?Math.round(subtotal*100):null,paid_at:paidAt,balance_due:paidAt?0:subtotal})
      const events=[['project_created',created],['estimate_generated',day(age,9)],...(sent?[['estimate_sent',sentAt]]:[]),...(responded?[[accepted?'estimate_accepted':'estimate_declined',respondedAt]]:[])]
      events.forEach(([event_type,created_at],eventIndex)=>add('estimate_activity',{id:id(`activity:${index}:${eventIndex}`),project_id:projectId,estimate_id:estimateId,company_id:COMPANY,event_type,created_at,metadata:{simulation:true,seed:SEED}}))
      if(paidAt)add('invoices',{id:id(`invoice:${index}`),estimate_id:estimateId,company_id:COMPANY,kind:'full',amount_cents:Math.round(subtotal*100),currency_code:'USD',project_name:name,description:'Simulated full payment for tutorial recording. No charge was created.',status:'paid',paid_at:paidAt,created_at:respondedAt,updated_at:paidAt})
    })
    const preview={mode:APPLY?'apply':'dry-run',company:account.name,archiveProjects:snapshot.projects.length,softDeleteCatalogue:snapshot.catalogue.length,renameFolders:folders.length,insert:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),projects:tables.estimates.map((e,i)=>({name:JOBS[i][1],state:JOBS[i][3],total:e.total})),acceptedValue:money(tables.estimates.filter(e=>e.client_response==='accepted').reduce((sum,e)=>sum+e.total,0))}
    console.log(JSON.stringify(preview,null,2))
    if(!APPLY){await db.query('ROLLBACK');return}
    snapshot.insertedIds=Object.fromEntries(Object.entries(tables).filter(([name])=>name!=='price_book_folders').map(([name,rows])=>[name,rows.map(row=>row.id)]))
    const dir=resolve('.bg-shell/video-workspace');await mkdir(dir,{recursive:true});const backup=resolve(dir,`${COMPANY}-${Date.now()}-before.json`);await writeFile(backup,JSON.stringify(snapshot,null,2),{flag:'wx'})
    await db.query('UPDATE projects SET archived_at=now() WHERE company_id=$1 AND archived_at IS NULL AND deleted_at IS NULL',[COMPANY])
    await db.query('UPDATE company_price_book SET deleted_at=now() WHERE company_id=$1 AND deleted_at IS NULL',[COMPANY])
    await db.query('UPDATE companies SET industry=$2,industries=$3,default_payment_terms=$4,default_warranty_terms=$5,default_validity_days=30 WHERE id=$1',[COMPANY,'general_contracting',['general_contracting','remodeling','painting','house_cleaning','upholstery_carpet_cleaning','electrical','plumbing','handyman','landscaping'],'Payment due upon completion unless otherwise agreed in writing.','Workmanship warranty and service scope are specified in each estimate.'])
    for(const row of tables.price_book_folders){if(folders.some(f=>f.id===row.id))await db.query('UPDATE price_book_folders SET name=$2,sort_order=$3 WHERE id=$1 AND company_id=$4',[row.id,row.name,row.sort_order,COMPANY]);else await insert('price_book_folders',row)}
    for(const table of ['clients','company_price_book','projects','estimates','estimate_sections','estimate_items','estimate_activity','invoices'])for(const row of tables[table]??[])await insert(table,row)
    const result=await verify();if(await protectedState()!==snapshot.protectedHash)throw new Error('Protected account/company state changed; rolling back');await db.query('COMMIT');console.log(JSON.stringify({committed:true,result,protectedStateUnchanged:true,backup},null,2))
  }catch(error){await db.query('ROLLBACK');throw error}finally{await db.end()}
}
main().catch(error=>{console.error(JSON.stringify({error:error.message,code:error.code}));process.exitCode=1})
