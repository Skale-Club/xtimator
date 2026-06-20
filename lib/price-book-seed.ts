import type { SupabaseClient } from '@supabase/supabase-js'

type DefaultItem = {
  name: string
  unit: string
  unit_price: number
  notes?: string
}

type DefaultFolder = {
  name: string
  items: DefaultItem[]
}

const HOUSE_CLEANING: DefaultFolder[] = [
  {
    name: 'Standard / Regular Cleaning',
    items: [
      { name: 'Standard cleaning — small home / apartment (1 bed, up to ~1,000 sqft)', unit: 'visit', unit_price: 120 },
      { name: 'Standard cleaning — mid-size home (2–3 bed, ~1,000–2,000 sqft)', unit: 'visit', unit_price: 175 },
      { name: 'Standard cleaning — large home (4+ bed, 2,500+ sqft)', unit: 'visit', unit_price: 280 },
      { name: 'Recurring weekly cleaning (per visit)', unit: 'visit', unit_price: 130, notes: 'Discounted recurring rate' },
      { name: 'Recurring bi-weekly cleaning (per visit)', unit: 'visit', unit_price: 150 },
      { name: 'Recurring monthly cleaning (per visit)', unit: 'visit', unit_price: 175 },
      { name: 'General cleaning labor (per cleaner)', unit: 'hr', unit_price: 50, notes: 'Single cleaner; typical $25–$60/hr' },
    ],
  },
  {
    name: 'Deep Cleaning',
    items: [
      { name: 'One-time deep clean — small home / apartment', unit: 'visit', unit_price: 250 },
      { name: 'One-time deep clean — mid-size home (~2,000 sqft)', unit: 'visit', unit_price: 375 },
      { name: 'One-time deep clean — large home (2,500+ sqft)', unit: 'visit', unit_price: 550 },
      { name: 'Deep clean (priced by area)', unit: 'sqft', unit_price: 0.20, notes: 'Typical $0.13–$0.30/sqft' },
      { name: 'Deep clean labor (per cleaner)', unit: 'hr', unit_price: 60, notes: 'Higher than standard rate' },
      { name: 'Kitchen deep clean (cabinets, appliances, degrease)', unit: 'each', unit_price: 110 },
      { name: 'Bathroom deep clean (descale, grout, fixtures) — per bathroom', unit: 'room', unit_price: 75 },
    ],
  },
  {
    name: 'Move-In / Move-Out & Post-Construction',
    items: [
      { name: 'Move-out / move-in cleaning — small home / apartment', unit: 'visit', unit_price: 200 },
      { name: 'Move-out / move-in cleaning — mid-size home', unit: 'visit', unit_price: 350 },
      { name: 'Move-out / move-in cleaning — large home', unit: 'visit', unit_price: 500 },
      { name: 'Move-out / move-in cleaning (priced by area)', unit: 'sqft', unit_price: 0.27, notes: 'Typical $0.22–$0.33/sqft' },
      { name: 'Post-construction cleaning — final clean', unit: 'sqft', unit_price: 0.50, notes: 'Typical $0.30–$0.75/sqft' },
      { name: 'Post-construction cleaning — rough / first pass', unit: 'sqft', unit_price: 0.25, notes: 'Typical $0.15–$0.40/sqft' },
      { name: 'Post-construction / heavy debris labor (per cleaner)', unit: 'hr', unit_price: 65 },
    ],
  },
  {
    // Kitchen / dish / appliance extras that house cleaners commonly bill separately.
    name: 'Kitchen & Appliance Add-ons',
    items: [
      { name: 'Wash dishes by hand (per sink load)', unit: 'each', unit_price: 25 },
      { name: 'Load / unload dishwasher', unit: 'each', unit_price: 15 },
      { name: 'Clean inside dishwasher', unit: 'each', unit_price: 35 },
      { name: 'Clean stovetop / range (degrease)', unit: 'each', unit_price: 30 },
      { name: 'Clean inside oven', unit: 'each', unit_price: 35, notes: 'Typical $25–$60' },
      { name: 'Clean inside microwave', unit: 'each', unit_price: 20 },
      { name: 'Clean inside refrigerator / freezer', unit: 'each', unit_price: 35, notes: 'Typical $25–$50' },
      { name: 'Clean inside kitchen cabinets', unit: 'each', unit_price: 40, notes: 'Emptied cabinets; higher if full' },
    ],
  },
  {
    name: 'Other Add-ons & Labor',
    items: [
      { name: 'Clean interior windows (per window)', unit: 'each', unit_price: 8, notes: 'Roughly $5–$10 each' },
      { name: 'Laundry — wash, dry & fold (per load)', unit: 'each', unit_price: 25, notes: 'Fold-only ~$9' },
      { name: 'Change bed linens / make beds (per bed)', unit: 'each', unit_price: 12 },
      { name: 'Clean baseboards — whole home', unit: 'each', unit_price: 40, notes: '~$15 per room' },
      { name: 'Clean blinds / window treatments (per set)', unit: 'each', unit_price: 10 },
      { name: 'Wall washing / spot cleaning', unit: 'hr', unit_price: 50, notes: 'Whole-home interior walls ~$100' },
      { name: 'Pet hair removal', unit: 'each', unit_price: 30, notes: 'Typical $20–$40' },
      { name: 'Garage cleaning', unit: 'each', unit_price: 60 },
      { name: 'Basement cleaning', unit: 'each', unit_price: 60 },
      { name: 'Additional cleaning labor / à la carte', unit: 'hr', unit_price: 50 },
    ],
  },
]

const UPHOLSTERY_CARPET_CLEANING: DefaultFolder[] = [
  {
    name: 'Carpet Cleaning',
    items: [
      { name: 'Carpet cleaning — per room', unit: 'room', unit_price: 50, notes: 'Typical $35–75; ~200 sqft room' },
      { name: 'Carpet cleaning — per sqft (hot water extraction)', unit: 'sqft', unit_price: 0.35, notes: 'Range $0.20–0.50/sqft' },
      { name: 'Hallway cleaning (each)', unit: 'each', unit_price: 25 },
      { name: 'Carpeted stairs (per step)', unit: 'step', unit_price: 3, notes: '~$45–65 per staircase' },
      { name: 'Whole-house carpet cleaning minimum', unit: 'each', unit_price: 199, notes: 'Whole-house typ. $200–500' },
      { name: 'Closet / small area cleaning (each)', unit: 'each', unit_price: 20 },
    ],
  },
  {
    name: 'Upholstery Cleaning',
    items: [
      { name: 'Armchair cleaning (each)', unit: 'each', unit_price: 60 },
      { name: 'Recliner cleaning (each)', unit: 'each', unit_price: 75 },
      { name: 'Loveseat cleaning — 2-seat (each)', unit: 'each', unit_price: 105 },
      { name: 'Sofa cleaning — 3-seat (each)', unit: 'each', unit_price: 150, notes: 'Standard fabric sofa $100–300' },
      { name: 'Sectional cleaning (per seat)', unit: 'seat', unit_price: 45, notes: 'Whole sectional typ. $120–400' },
      { name: 'Dining chair cleaning (each)', unit: 'each', unit_price: 25 },
      { name: 'Ottoman cleaning (each)', unit: 'each', unit_price: 40 },
      { name: 'Leather conditioning / cleaning (per seat)', unit: 'seat', unit_price: 65 },
    ],
  },
  {
    name: 'Mattresses & Specialty Rugs',
    items: [
      { name: 'Mattress cleaning — Twin (each)', unit: 'each', unit_price: 60 },
      { name: 'Mattress cleaning — Queen (each)', unit: 'each', unit_price: 100, notes: 'Varies by size' },
      { name: 'Mattress cleaning — King (each)', unit: 'each', unit_price: 130 },
      { name: 'Area rug cleaning (per sqft)', unit: 'sqft', unit_price: 4, notes: 'Range $2–8/sqft by material' },
      { name: 'Oriental / wool rug cleaning (per sqft)', unit: 'sqft', unit_price: 6, notes: 'Hand-wash; often $200–400 per rug' },
      { name: 'Tile & grout cleaning (per sqft)', unit: 'sqft', unit_price: 1.5, notes: 'Range $0.50–3.50/sqft; ~$100 min' },
    ],
  },
  {
    name: 'Treatments & Add-ons',
    items: [
      { name: 'Stain / spot treatment (per area)', unit: 'each', unit_price: 25 },
      { name: 'Pet odor / enzyme treatment (per room)', unit: 'room', unit_price: 40 },
      { name: 'Scotchgard / fabric protector (per room)', unit: 'room', unit_price: 40 },
      { name: 'Deodorizer treatment (per room)', unit: 'room', unit_price: 30 },
      { name: 'Carpet stretching (per room)', unit: 'room', unit_price: 150, notes: 'First room $100–300; +$50–75 each add’l' },
      { name: 'Carpet patch / repair (per repair)', unit: 'each', unit_price: 200, notes: 'Typical $140–400 per project' },
    ],
  },
  {
    name: 'Labor & Trip',
    items: [
      { name: 'Service-call / minimum charge', unit: 'each', unit_price: 99, notes: 'Typical minimum $75–125' },
      { name: 'Technician labor (per hour)', unit: 'hr', unit_price: 75, notes: 'Billed $60–100/hr per tech' },
      { name: 'Trip / travel fee (out-of-area)', unit: 'each', unit_price: 35 },
      { name: 'After-hours / emergency surcharge', unit: 'each', unit_price: 75 },
    ],
  },
]

/**
 * Default, market-rate price books per onboarding industry.
 *
 * Prices are US national-average RETAIL rates (what a contractor charges the
 * customer), triangulated from HomeAdvisor, Angi, Forbes Home, Fixr, Thumbtack,
 * HomeGuide and trade-specific pricing guides (2025–2026). They are starting
 * points — business owners personalize them after onboarding.
 */
const INDUSTRY_PRICE_BOOK: Record<string, DefaultFolder[]> = {
  house_cleaning: HOUSE_CLEANING,
  // Legacy alias: accounts created before the cleaning split stored industry = 'cleaning'.
  cleaning: HOUSE_CLEANING,
  upholstery_carpet_cleaning: UPHOLSTERY_CARPET_CLEANING,

  painting: [
    {
      name: 'Interior Painting',
      items: [
        { name: 'Interior walls — 2 coats (per sqft)', unit: 'sqft', unit_price: 2.75, notes: 'Wall area, standard prep, two coats' },
        { name: 'Walls, trim & ceilings — full room (per sqft)', unit: 'sqft', unit_price: 4.70, notes: 'Floor area; walls, trim and ceiling' },
        { name: 'Ceiling — 2 coats (per sqft)', unit: 'sqft', unit_price: 2.00, notes: 'Flat ceiling; add for vaulted/textured' },
        { name: 'Average room — walls only (per room)', unit: 'room', unit_price: 450, notes: 'Typical 10x12 bedroom, walls only' },
        { name: 'Accent wall (each)', unit: 'each', unit_price: 200 },
        { name: 'Heavy surface prep & repair (per sqft)', unit: 'sqft', unit_price: 1.00, notes: 'Patching cracks, peeling, water stains' },
        { name: 'Interior door — both sides (each)', unit: 'each', unit_price: 125 },
        { name: 'Baseboard & trim (per lf)', unit: 'lf', unit_price: 2.50 },
      ],
    },
    {
      name: 'Exterior Painting',
      items: [
        { name: 'Exterior body — 2 coats (per sqft)', unit: 'sqft', unit_price: 3.00, notes: 'Wall surface; standard prep, two coats' },
        { name: 'Trim & fascia (per lf)', unit: 'lf', unit_price: 3.00 },
        { name: 'Soffit & eaves (per sqft)', unit: 'sqft', unit_price: 2.50 },
        { name: 'Exterior door (each)', unit: 'each', unit_price: 150 },
        { name: 'Shutters (per pair)', unit: 'each', unit_price: 75 },
        { name: 'Power washing / surface prep (per sqft)', unit: 'sqft', unit_price: 0.40 },
        { name: 'Deck staining & sealing (per sqft)', unit: 'sqft', unit_price: 4.00, notes: 'Includes light sand and seal' },
        { name: 'Fence staining (per sqft)', unit: 'sqft', unit_price: 2.00 },
      ],
    },
    {
      name: 'Cabinet Refinishing & Staining',
      items: [
        { name: 'Cabinet painting — sprayed (per lf)', unit: 'lf', unit_price: 50, notes: 'Degrease, sand, prime, two finish coats' },
        { name: 'Cabinet refinishing / re-staining (per lf)', unit: 'lf', unit_price: 75 },
        { name: 'Cabinet door & drawer front (each)', unit: 'each', unit_price: 60, notes: 'Both sides, sprayed finish' },
        { name: 'Re-stain cabinets (per sqft of faces)', unit: 'sqft', unit_price: 10 },
        { name: 'Built-in / bookcase refinishing (each)', unit: 'each', unit_price: 350 },
        { name: 'Vanity refinishing (each)', unit: 'each', unit_price: 400, notes: 'Single bathroom vanity' },
        { name: 'Hardware removal & reinstall (per door/drawer)', unit: 'each', unit_price: 8 },
      ],
    },
    {
      name: 'Wallpaper & Specialty Finishes',
      items: [
        { name: 'Wallpaper installation (per sqft)', unit: 'sqft', unit_price: 5.00, notes: 'Labor only; excludes wallpaper material' },
        { name: 'Wallpaper removal (per sqft)', unit: 'sqft', unit_price: 2.00, notes: 'Soak and scrape; add for stubborn glue' },
        { name: 'Skim coat / wall smoothing after removal (per sqft)', unit: 'sqft', unit_price: 1.50 },
        { name: 'Faux / decorative finish (per sqft)', unit: 'sqft', unit_price: 6.00, notes: 'Venetian plaster, glaze, color wash' },
        { name: 'Accent / specialty ceiling finish (per sqft)', unit: 'sqft', unit_price: 4.00 },
        { name: 'Texture application or knockdown (per sqft)', unit: 'sqft', unit_price: 1.75 },
      ],
    },
    {
      name: 'Materials & Labor',
      items: [
        { name: 'Standard interior/exterior paint (per gal)', unit: 'gal', unit_price: 45, notes: 'Mid-grade; covers ~350 sqft per coat' },
        { name: 'Premium paint (per gal)', unit: 'gal', unit_price: 65, notes: 'Professional-grade' },
        { name: 'Primer (per gal)', unit: 'gal', unit_price: 35 },
        { name: 'Stain / sealer (per gal)', unit: 'gal', unit_price: 50 },
        { name: 'Painter labor (per hr)', unit: 'hr', unit_price: 50, notes: 'Per painter; small jobs and add-ons' },
        { name: 'Masking, drop cloths & supplies (per room)', unit: 'room', unit_price: 40 },
        { name: 'Trip / minimum service charge', unit: 'each', unit_price: 250, notes: 'Typical job minimum' },
      ],
    },
  ],

  landscaping: [
    {
      name: 'Lawn Care & Maintenance',
      items: [
        { name: 'Lawn mowing & edging (per visit)', unit: 'visit', unit_price: 55, notes: 'Routine cut; quarter-acre lot' },
        { name: 'Lawn fertilization treatment (per application)', unit: 'visit', unit_price: 80, notes: 'Per 5,000 sqft' },
        { name: 'Core aeration (per visit)', unit: 'visit', unit_price: 140, notes: 'Typical 1/4-acre lot' },
        { name: 'Overseeding (per sqft)', unit: 'sqft', unit_price: 0.04 },
        { name: 'Sod installation (per sqft)', unit: 'sqft', unit_price: 1.65, notes: 'Materials and labor' },
        { name: 'Weed control treatment (per visit)', unit: 'visit', unit_price: 100 },
        { name: 'Leaf removal (per visit)', unit: 'visit', unit_price: 350, notes: 'Seasonal; varies with property size' },
        { name: 'Spring / fall yard cleanup (per visit)', unit: 'visit', unit_price: 250 },
      ],
    },
    {
      name: 'Garden Design & Planting',
      items: [
        { name: 'Mulch installation (per cubic yard)', unit: 'cu yd', unit_price: 85, notes: 'Delivered and spread' },
        { name: 'Shrub planting (per shrub)', unit: 'each', unit_price: 55, notes: 'Includes plant and labor' },
        { name: 'Tree planting (per tree)', unit: 'each', unit_price: 450, notes: 'Standard nursery tree' },
        { name: 'Annual / perennial flower planting (per sqft)', unit: 'sqft', unit_price: 12 },
        { name: 'Garden bed installation (per sqft)', unit: 'sqft', unit_price: 14, notes: 'New bed prep and edging' },
        { name: 'Landscape design plan (flat)', unit: 'each', unit_price: 600, notes: 'Custom plan; often credited toward install' },
        { name: 'Topsoil / soil amendment (per cubic yard)', unit: 'cu yd', unit_price: 75, notes: 'Delivered and graded' },
      ],
    },
    {
      name: 'Tree & Shrub Service',
      items: [
        { name: 'Tree trimming / pruning (per tree)', unit: 'each', unit_price: 450, notes: 'Medium tree; large trees higher' },
        { name: 'Tree removal (per tree)', unit: 'each', unit_price: 850, notes: 'Average tree; excludes large/hazardous' },
        { name: 'Stump grinding (per stump)', unit: 'each', unit_price: 325 },
        { name: 'Shrub / hedge trimming (per shrub)', unit: 'each', unit_price: 30 },
        { name: 'Shrub removal (per shrub)', unit: 'each', unit_price: 75 },
        { name: 'Tree & shrub fertilization / deep root feeding (per visit)', unit: 'visit', unit_price: 150 },
      ],
    },
    {
      name: 'Hardscaping',
      items: [
        { name: 'Paver patio installation (per sqft)', unit: 'sqft', unit_price: 16, notes: 'Standard concrete pavers; materials + labor' },
        { name: 'Paver walkway installation (per sqft)', unit: 'sqft', unit_price: 15, notes: 'Includes base prep' },
        { name: 'Retaining wall construction (per sqft of wall face)', unit: 'sqft', unit_price: 35, notes: 'Segmental block wall' },
        { name: 'Flagstone / natural stone patio (per sqft)', unit: 'sqft', unit_price: 30, notes: 'Premium material' },
        { name: 'Gravel / decomposed granite path (per sqft)', unit: 'sqft', unit_price: 8 },
        { name: 'Landscape edging / borders (per lf)', unit: 'lf', unit_price: 9, notes: 'Paver or stone edging' },
        { name: 'Excavation / grading (per sqft)', unit: 'sqft', unit_price: 1.50, notes: 'Site prep prior to hardscape' },
      ],
    },
    {
      name: 'Irrigation',
      items: [
        { name: 'Sprinkler system installation (per zone)', unit: 'zone', unit_price: 800, notes: 'In-ground automatic system' },
        { name: 'Drip irrigation installation (per sqft)', unit: 'sqft', unit_price: 1.00, notes: 'Bed and border drip lines' },
        { name: 'Sprinkler head replacement (per head)', unit: 'each', unit_price: 12 },
        { name: 'Irrigation system repair (per hour)', unit: 'hr', unit_price: 85, notes: 'Diagnostics and labor' },
        { name: 'Backflow preventer testing / installation (each)', unit: 'each', unit_price: 175 },
        { name: 'Seasonal winterization / blowout (per visit)', unit: 'visit', unit_price: 90 },
        { name: 'Smart controller installation (each)', unit: 'each', unit_price: 350, notes: 'Wi-Fi controller plus setup' },
      ],
    },
    {
      name: 'Labor & Hauling',
      items: [
        { name: 'General landscaping labor (per hour)', unit: 'hr', unit_price: 65, notes: 'Per crew member' },
        { name: 'Skilled / lead crew labor (per hour)', unit: 'hr', unit_price: 95 },
        { name: 'Equipment operator (per hour)', unit: 'hr', unit_price: 110, notes: 'Includes machine time' },
        { name: 'Hauling / debris disposal (per cubic yard)', unit: 'cu yd', unit_price: 60, notes: 'Dump fees plus labor' },
        { name: 'Trip / mobilization fee', unit: 'each', unit_price: 75, notes: 'Per visit minimum' },
      ],
    },
  ],

  electrical: [
    {
      name: 'Service & Repairs',
      items: [
        { name: 'Standard labor rate (licensed electrician)', unit: 'hr', unit_price: 100, notes: 'National avg $75–130/hr' },
        { name: 'Service call / diagnostic fee', unit: 'visit', unit_price: 125, notes: 'Often credited toward first hour' },
        { name: 'Electrical troubleshooting (dead circuit, tripping breaker)', unit: 'hr', unit_price: 110 },
        { name: 'Emergency / after-hours service rate', unit: 'hr', unit_price: 200, notes: 'Nights, weekends, holidays; plus service call' },
        { name: 'Replace standard outlet (receptacle)', unit: 'each', unit_price: 200, notes: 'Existing wiring; less per-unit in batches' },
        { name: 'Install new outlet (new location)', unit: 'each', unit_price: 230, notes: 'Includes running wire from existing circuit' },
        { name: 'Install / replace GFCI outlet', unit: 'each', unit_price: 210, notes: 'Kitchen, bath, garage, exterior' },
        { name: 'Replace light switch', unit: 'each', unit_price: 150, notes: 'Standard single-pole; existing wiring' },
        { name: 'Install smart switch or dimmer', unit: 'each', unit_price: 130, notes: 'Customer-supplied device' },
      ],
    },
    {
      name: 'Fixtures & Lighting',
      items: [
        { name: 'Install ceiling fan (existing wiring & box)', unit: 'each', unit_price: 250, notes: 'Add cost if box must be braced' },
        { name: 'Install light fixture (standard, existing wiring)', unit: 'each', unit_price: 175 },
        { name: 'Install chandelier or pendant (heavy / high ceiling)', unit: 'each', unit_price: 450 },
        { name: 'Install recessed (can) light', unit: 'each', unit_price: 200, notes: 'Per fixture; less per unit in quantity' },
        { name: 'Install hardwired smoke / CO detector', unit: 'each', unit_price: 120, notes: 'Existing wiring' },
        { name: 'Install under-cabinet or accent lighting', unit: 'job', unit_price: 350, notes: 'Typical kitchen run' },
        { name: 'Install exterior / motion-sensor fixture', unit: 'each', unit_price: 225, notes: 'Existing exterior box' },
      ],
    },
    {
      name: 'Panels & Service Upgrades',
      items: [
        { name: 'Panel upgrade to 200 amp', unit: 'job', unit_price: 2200, notes: 'Range $1,300–3,000; excludes permit fees' },
        { name: 'Panel upgrade to 100 amp', unit: 'job', unit_price: 1600, notes: 'Excludes permit fees' },
        { name: 'Install subpanel (attached, garage / basement)', unit: 'each', unit_price: 1100, notes: 'Detached runs cost more; excludes permit' },
        { name: 'Replace breaker', unit: 'each', unit_price: 180, notes: 'Standard single breaker; existing panel' },
        { name: 'Install whole-house surge protector', unit: 'each', unit_price: 300, notes: 'Panel-mounted device' },
        { name: 'Electrical permit handling (pull & coordinate)', unit: 'each', unit_price: 250, notes: 'Permit fee billed at city cost' },
      ],
    },
    {
      name: 'Large Projects',
      items: [
        { name: 'EV charger installation (Level 2, 240V)', unit: 'job', unit_price: 1200, notes: 'Dedicated circuit + install; excludes charger unit' },
        { name: 'Install dedicated circuit (120V, 20A)', unit: 'each', unit_price: 600, notes: 'Varies with distance to panel' },
        { name: 'Install 240V circuit / outlet (dryer, range, welder)', unit: 'each', unit_price: 700, notes: 'Depends on run length and panel access' },
        { name: 'Whole-house rewire (per sqft)', unit: 'sqft', unit_price: 7, notes: 'National avg $5–17/sqft; older homes higher' },
        { name: 'Standby (whole-house) generator installation', unit: 'job', unit_price: 8000, notes: 'Labor + transfer switch; excludes generator unit' },
        { name: 'Install automatic transfer switch', unit: 'each', unit_price: 1500, notes: 'For standby generator' },
      ],
    },
  ],

  plumbing: [
    {
      name: 'Repairs & Service',
      items: [
        { name: 'Standard service call / diagnostic visit', unit: 'visit', unit_price: 100, notes: 'Often credited toward repair' },
        { name: 'Plumbing labor — journeyman (standard rate)', unit: 'hr', unit_price: 90, notes: 'National avg $45–200/hr' },
        { name: 'Drain cleaning — sink / tub / toilet (snake)', unit: 'job', unit_price: 200, notes: 'Single accessible clog' },
        { name: 'Main sewer line cleaning (snake)', unit: 'job', unit_price: 400, notes: 'Through cleanout; $200–800 by access' },
        { name: 'Hydro jetting — main line', unit: 'job', unit_price: 700, notes: 'Severe / recurring blockage' },
        { name: 'Pipe leak repair — accessible', unit: 'job', unit_price: 350, notes: 'Single accessible joint; excludes in-wall' },
        { name: 'Toilet repair (flapper, fill valve, wax ring)', unit: 'job', unit_price: 175, notes: 'Labor + minor parts' },
        { name: 'Faucet repair — leaky / dripping', unit: 'job', unit_price: 200, notes: 'Cartridge / washer / O-ring' },
      ],
    },
    {
      name: 'Fixture Installation',
      items: [
        { name: 'Faucet installation — kitchen or bath', unit: 'each', unit_price: 260, notes: 'Labor + supply lines; fixture not included' },
        { name: 'Toilet installation / replacement', unit: 'each', unit_price: 375, notes: 'Labor + wax ring/bolts; toilet supplied separately' },
        { name: 'Garbage disposal installation', unit: 'each', unit_price: 300, notes: 'Labor only $100–250; ~$300–500 with unit' },
        { name: 'Dishwasher hookup / installation', unit: 'each', unit_price: 200, notes: 'Connect to existing rough-in' },
        { name: 'Shower / tub valve replacement', unit: 'each', unit_price: 350, notes: 'In-wall access adds cost' },
        { name: 'Kitchen / bathroom sink installation', unit: 'each', unit_price: 350 },
        { name: 'Hose bib / outdoor faucet replacement', unit: 'each', unit_price: 200, notes: 'Standard accessible exterior spigot' },
      ],
    },
    {
      name: 'Water Heaters',
      items: [
        { name: 'Water heater — 40 gal, traditional gas (installed)', unit: 'each', unit_price: 1500, notes: 'Unit + labor; like-for-like swap' },
        { name: 'Water heater — 50 gal, traditional gas (installed)', unit: 'each', unit_price: 1700 },
        { name: 'Water heater — 50 gal, electric (installed)', unit: 'each', unit_price: 1500 },
        { name: 'Tankless water heater — gas (installed)', unit: 'each', unit_price: 4000, notes: '$3,000–6,500 incl. gas/vent upgrades' },
        { name: 'Tankless water heater — electric (installed)', unit: 'each', unit_price: 3000 },
        { name: 'Water heater labor only (customer-supplied unit)', unit: 'job', unit_price: 500 },
        { name: 'Expansion tank installation', unit: 'each', unit_price: 200, notes: 'Often required by code on closed systems' },
      ],
    },
    {
      name: 'Repiping & Sewer',
      items: [
        { name: 'Whole-house repipe — PEX', unit: 'job', unit_price: 6000, notes: 'Typical 2-bath home; $4,000–9,000' },
        { name: 'Whole-house repipe — copper', unit: 'job', unit_price: 10000, notes: '$8,000–15,000' },
        { name: 'Water / sewer line — trenched dig & replace (per lf)', unit: 'lf', unit_price: 150, notes: 'Traditional excavation; $50–250/lf' },
        { name: 'Sewer line — trenchless replacement (per lf)', unit: 'lf', unit_price: 140, notes: 'Pipe burst / lining; $80–200/lf' },
        { name: 'Sewer camera inspection', unit: 'job', unit_price: 250, notes: 'Locate / diagnose line condition' },
        { name: 'Main water line repair', unit: 'job', unit_price: 900, notes: 'Service line leak; $340–1,500' },
      ],
    },
  ],

  handyman: [
    {
      name: 'General Repairs',
      items: [
        { name: 'Handyman labor (standard rate)', unit: 'hr', unit_price: 85, notes: 'National avg $65–$125/hr' },
        { name: 'Service call / minimum trip charge', unit: 'each', unit_price: 100, notes: 'Covers first hour or small task minimum' },
        { name: 'Drywall patch (small hole, under 6")', unit: 'each', unit_price: 125, notes: 'Incl. sand & touch-up' },
        { name: 'Drywall patch (medium hole, 6"–12")', unit: 'each', unit_price: 200, notes: 'Mesh/patch, multiple compound coats' },
        { name: 'Caulking (per window or tub / shower)', unit: 'each', unit_price: 75, notes: 'Remove old & reseal' },
        { name: 'Weather stripping (per door)', unit: 'each', unit_price: 60, notes: '$35–$90 per door installed' },
        { name: 'Gutter cleaning (single-story home)', unit: 'each', unit_price: 165, notes: 'Avg $119–$234' },
      ],
    },
    {
      name: 'Assembly & Mounting',
      items: [
        { name: 'TV wall mount (drywall / standard)', unit: 'each', unit_price: 175, notes: 'Flat fee per TV' },
        { name: 'TV wall mount (over fireplace / brick / concrete)', unit: 'each', unit_price: 300, notes: 'Difficulty surcharge $50–$200' },
        { name: 'Furniture assembly (flat-pack, per piece)', unit: 'each', unit_price: 120, notes: 'Dressers, beds, desks' },
        { name: 'Floating shelf installation (per shelf)', unit: 'each', unit_price: 110, notes: 'On drywall with anchors' },
        { name: 'Bracket shelving / closet shelf (per shelf)', unit: 'each', unit_price: 85 },
        { name: 'Picture / mirror hanging (per item)', unit: 'each', unit_price: 45, notes: 'Heavier items priced higher' },
        { name: 'Curtain rod / blinds installation (per window)', unit: 'each', unit_price: 65 },
      ],
    },
    {
      name: 'Carpentry & Doors',
      items: [
        { name: 'Interior door install (slab in existing frame)', unit: 'each', unit_price: 200, notes: 'Labor only; hang, shim, adjust' },
        { name: 'Interior door install (new pre-hung unit)', unit: 'each', unit_price: 350, notes: 'Includes frame set & casing labor' },
        { name: 'Door casing / trim (per opening)', unit: 'each', unit_price: 125 },
        { name: 'Trim / molding installation — baseboard (per lf)', unit: 'lf', unit_price: 4, notes: 'Crown molding priced higher' },
        { name: 'Deadbolt / lock install (existing prep)', unit: 'each', unit_price: 110 },
        { name: 'Door knob / handle replacement', unit: 'each', unit_price: 75, notes: 'Swap existing hardware' },
        { name: 'Tile repair / replacement (per tile)', unit: 'each', unit_price: 125, notes: 'Single cracked tile; minimum often applies' },
        { name: 'Tile / grout repair (per sqft)', unit: 'sqft', unit_price: 20, notes: '$10–$50 per sqft range' },
      ],
    },
  ],

  roofing: [
    {
      name: 'Asphalt Shingles',
      items: [
        { name: 'Asphalt shingles — 3-tab (per sq)', unit: 'sq', unit_price: 400, notes: '1 sq = 100 sqft; materials + labor' },
        { name: 'Asphalt shingles — architectural / dimensional (per sq)', unit: 'sq', unit_price: 550, notes: '1 sq = 100 sqft; most common choice' },
        { name: 'Asphalt shingles — luxury / designer (per sq)', unit: 'sq', unit_price: 750, notes: '1 sq = 100 sqft; premium lines' },
        { name: 'Roof tear-off & disposal (per sq)', unit: 'sq', unit_price: 175, notes: '1 sq = 100 sqft; single layer' },
        { name: 'Synthetic underlayment (per sq)', unit: 'sq', unit_price: 45, notes: '1 sq = 100 sqft; material + labor' },
        { name: 'Drip edge (per lf)', unit: 'lf', unit_price: 3, notes: 'Galvanized / aluminum, installed' },
        { name: 'Ridge vent installation (per lf)', unit: 'lf', unit_price: 11, notes: 'Continuous ridge ventilation' },
      ],
    },
    {
      name: 'Repairs & Specialty',
      items: [
        { name: 'Shingle repair — small area', unit: 'job', unit_price: 400, notes: 'Replace a few missing / damaged shingles' },
        { name: 'Roof flashing repair / reseal', unit: 'job', unit_price: 350, notes: 'Chimney, vent, or wall flashing' },
        { name: 'Flashing replacement', unit: 'job', unit_price: 900, notes: 'Full replace incl. surrounding shingles' },
        { name: 'Roof inspection', unit: 'each', unit_price: 250, notes: 'Professional condition / leak inspection' },
        { name: 'Skylight flashing & seal repair', unit: 'each', unit_price: 450, notes: 'Re-flash and seal around existing skylight' },
        { name: 'Metal roofing — standing seam (per sq)', unit: 'sq', unit_price: 1200, notes: '1 sq = 100 sqft; steel / aluminum, installed' },
        { name: 'Roof leak diagnosis & patch', unit: 'job', unit_price: 550, notes: 'Locate active leak and spot repair' },
      ],
    },
    {
      name: 'Gutters',
      items: [
        { name: 'Seamless gutter installation (per lf)', unit: 'lf', unit_price: 12, notes: 'Aluminum K-style, material + labor' },
        { name: 'Downspout installation (per lf)', unit: 'lf', unit_price: 9, notes: 'Aluminum downspout, installed' },
        { name: 'Underground downspout drainage (each)', unit: 'each', unit_price: 250, notes: 'Buried drain line per downspout' },
        { name: 'Gutter guard installation (per lf)', unit: 'lf', unit_price: 12, notes: 'Mesh / screen leaf-guard system' },
        { name: 'Gutter cleaning', unit: 'job', unit_price: 175, notes: 'Standard home, ~150–200 lf' },
        { name: 'Gutter repair', unit: 'job', unit_price: 250, notes: 'Re-seal, re-pitch, or replace sections' },
      ],
    },
  ],

  hvac: [
    {
      name: 'Repairs & Service',
      items: [
        { name: 'Standard labor rate', unit: 'hr', unit_price: 110, notes: 'Residential, per technician' },
        { name: 'Diagnostic / service call fee', unit: 'visit', unit_price: 125, notes: 'Often credited toward repair' },
        { name: 'Refrigerant recharge — R-410A (per lb)', unit: 'lb', unit_price: 75, notes: 'Installed; price rising with phase-down' },
        { name: 'Capacitor replacement', unit: 'each', unit_price: 300, notes: 'Part and labor' },
        { name: 'Contactor replacement', unit: 'each', unit_price: 250, notes: 'Part and labor' },
        { name: 'Blower motor replacement', unit: 'each', unit_price: 600, notes: 'Varies by motor type' },
        { name: 'Furnace control board replacement', unit: 'each', unit_price: 550, notes: 'Part and labor' },
        { name: 'After-hours / emergency surcharge', unit: 'visit', unit_price: 125, notes: 'Nights, weekends, holidays' },
      ],
    },
    {
      name: 'Equipment Installation',
      items: [
        { name: 'Central AC — 2-ton (installed)', unit: 'each', unit_price: 4500, notes: '~24,000 BTU; equipment and labor' },
        { name: 'Central AC — 3-ton (installed)', unit: 'each', unit_price: 5800, notes: '~36,000 BTU; equipment and labor' },
        { name: 'Central AC — 4-ton (installed)', unit: 'each', unit_price: 7000, notes: '~48,000 BTU; equipment and labor' },
        { name: 'Central AC — 5-ton (installed)', unit: 'each', unit_price: 8200, notes: '~60,000 BTU; equipment and labor' },
        { name: 'Gas furnace — 80,000 BTU (installed)', unit: 'each', unit_price: 5500, notes: 'Mid-efficiency; existing ductwork' },
        { name: 'Gas furnace — 100,000 BTU (installed)', unit: 'each', unit_price: 6800, notes: 'High-efficiency; existing ductwork' },
        { name: 'Ductless mini-split — single zone (installed)', unit: 'each', unit_price: 5000, notes: '~12,000–18,000 BTU' },
        { name: 'Smart thermostat (installed)', unit: 'each', unit_price: 350, notes: '+C-wire if needed' },
      ],
    },
    {
      name: 'Maintenance',
      items: [
        { name: 'HVAC tune-up / seasonal inspection', unit: 'visit', unit_price: 150, notes: 'Clean, inspect, test one system' },
        { name: 'Air filter replacement', unit: 'each', unit_price: 40, notes: 'Standard pleated filter' },
        { name: 'Evaporator coil cleaning', unit: 'job', unit_price: 300, notes: 'Indoor coil deep clean' },
        { name: 'Condenser coil cleaning', unit: 'job', unit_price: 175, notes: 'Outdoor unit cleaning' },
        { name: 'Air duct cleaning — whole home', unit: 'job', unit_price: 500, notes: 'Average single-family home' },
        { name: 'Duct cleaning (per vent)', unit: 'vent', unit_price: 40, notes: 'When priced by register' },
        { name: 'Dryer vent cleaning', unit: 'vent', unit_price: 130, notes: 'Add-on or standalone' },
      ],
    },
  ],
}

/**
 * Seeds the price book for a newly created company using industry-specific defaults.
 * No-ops if the company already has any price book items (prevents double-seeding).
 */
export async function seedIndustryPriceBook(
  supabase: SupabaseClient,
  companyId: string,
  industry: string | null | undefined,
  currencyCode = 'USD'
): Promise<void> {
  if (!industry) return

  const folders = INDUSTRY_PRICE_BOOK[industry]
  if (!folders) return

  // Guard: skip if already seeded
  const { count } = await supabase
    .from('company_price_book')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)

  if ((count ?? 0) > 0) return

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]

    const { data: folderRow, error: folderErr } = await supabase
      .from('price_book_folders')
      .insert({ company_id: companyId, name: folder.name, sort_order: i })
      .select('id')
      .single()

    if (folderErr || !folderRow) continue

    const items = folder.items.map((item) => ({
      company_id: companyId,
      folder_id: (folderRow as { id: string }).id,
      name: item.name,
      unit: item.unit,
      unit_price: item.unit_price,
      notes: item.notes ?? null,
      currency_code: currencyCode,
    }))

    if (items.length > 0) {
      await supabase.from('company_price_book').insert(items)
    }
  }
}
