---
phase: quick-260806-ngz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/industries.ts
  - components/onboarding/industry-selector.tsx
  - tests/unit/industries.test.ts
  - lib/price-book-seed.ts
autonomous: true
requirements: [QUICK-260806-ngz]

must_haves:
  truths:
    - "INDUSTRIES exports 13 entries; home_improvement, general_contracting and remodeling are selectable in the onboarding/settings industry selector"
    - "Each of the 3 new industries renders a real lucide icon in the selector (no blank icon slot)"
    - "A company that picks any of the 3 new trades gets 3 seeded price-book folders with realistic US pricing"
    - "No new price-book folder name collides with an existing one (buildMergedFolders dedupes by name — a collision silently drops the folder)"
    - "npx tsc -p tsconfig.ci.json is clean and vitest tests/unit tests/eval passes (minus the 2 known CRLF migration-shape failures)"
  artifacts:
    - path: "lib/industries.ts"
      provides: "13-entry INDUSTRIES catalog"
      contains: "id: 'home_improvement'"
    - path: "components/onboarding/industry-selector.tsx"
      provides: "ICON_MAP covering every INDUSTRIES icon"
    - path: "lib/price-book-seed.ts"
      provides: "INDUSTRY_PRICE_BOOK keys for the 3 new trades"
      contains: "general_contracting: ["
    - path: "tests/unit/industries.test.ts"
      provides: "count assertion updated to 13"
  key_links:
    - from: "lib/industries.ts (icon string)"
      to: "components/onboarding/industry-selector.tsx ICON_MAP"
      via: "ICON_MAP[industry.icon] lookup"
      pattern: "ICON_MAP"
    - from: "lib/industries.ts (id)"
      to: "lib/price-book-seed.ts INDUSTRY_PRICE_BOOK"
      via: "INDUSTRY_PRICE_BOOK[id] lookup in buildMergedFolders"
      pattern: "INDUSTRY_PRICE_BOOK\\["
---

<objective>
Add three first-class trades to the industry catalog — Home Improvement, General Contracting, Remodeling — taking INDUSTRIES from 10 to 13 entries, with matching selector icons and seeded price-book starter folders.

Purpose: These are among the most common US service-business categories and currently force users into free-text "custom" industries, which get no price-book seed and no icon.
Output: 3 catalog entries, 3 ICON_MAP icons, 3 INDUSTRY_PRICE_BOOK templates (9 folders total), updated unit test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@lib/industries.ts
@components/onboarding/industry-selector.tsx
@lib/price-book-seed.ts
@tests/unit/industries.test.ts

<interfaces>
<!-- Contracts already verified in the codebase. Use directly, no exploration needed. -->

lib/industries.ts:
```ts
export interface Industry {
  id: string
  label: string
  icon: string          // must be a key of ICON_MAP in industry-selector.tsx
  projectTypes: string[]
}
export const INDUSTRIES: Industry[] = [ /* 10 entries, hvac last */ ] as const satisfies Industry[]
```
New entries go AFTER the `hvac` entry (line ~128) and BEFORE `] as const satisfies Industry[]`.

lib/price-book-seed.ts:
```ts
type DefaultItem   = { name: string; unit: string; unit_price: number; notes?: string }
type DefaultFolder = { name: string; image_url?: string; items: DefaultItem[] }
const PX = (id: number): string => `https://images.pexels.com/photos/${id}/...`
const INDUSTRY_PRICE_BOOK: Record<string, DefaultFolder[]> = { /* ... hvac last, closes line ~610 */ }
```
`buildMergedFolders()` de-dupes folders BY NAME across all selected industries — any new folder
name that matches an existing one is silently dropped for multi-trade companies.

lucide-react v1.8.0 — verified these exports EXIST: HousePlus, HardHat, Ruler, Blocks, Building2,
DraftingCompass, PaintRoller, ClipboardList, Construction, Warehouse, Bath, CookingPot, Drill, Fence, DoorOpen.
</interfaces>

<allowed_pexels_ids>
Reuse ONLY these IDs (already present in lib/price-book-seed.ts, verified HTTP 200 at authoring time).
Do NOT invent new IDs:
1145434, 1249611, 1453499, 1463917, 1545743, 1669754, 186461, 209315, 257736, 2760242,
3637783, 3768912, 4098354, 4107278, 4491461, 462235, 4792436, 5691614, 589841, 9875428
</allowed_pexels_ids>

<existing_folder_names>
All 28 folder names currently in INDUSTRY_PRICE_BOOK (new names must not match any of these,
nor each other): Standard / Regular Cleaning · Deep Cleaning · Move-In / Move-Out & Post-Construction ·
Kitchen & Appliance Add-ons · Other Add-ons & Labor · (upholstery + window cleaning folders, lines 88–224) ·
Interior Painting · Exterior Painting · Cabinet Refinishing & Staining · Wallpaper & Specialty Finishes ·
Materials & Labor · Lawn Care & Maintenance · Garden Design & Planting · Tree & Shrub Service · Hardscaping ·
Irrigation · Labor & Hauling · Service & Repairs · Fixtures & Lighting · Panels & Service Upgrades ·
Large Projects · Repairs & Service · Fixture Installation · Water Heaters · Repiping & Sewer ·
General Repairs · Assembly & Mounting · Carpentry & Doors · Asphalt Shingles · Repairs & Specialty ·
Gutters · Equipment Installation · Maintenance
</existing_folder_names>

<out_of_scope>
- lib/seo/industries.ts (public marketing landing pages — separate decision, do NOT touch)
- lib/tax-rates.ts CLEANING_INDUSTRIES (these are not cleaning trades — full state rate is correct)
</out_of_scope>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the 3 catalog entries + selector icons + update the count test</name>
  <files>lib/industries.ts, components/onboarding/industry-selector.tsx, tests/unit/industries.test.ts</files>
  <action>
**lib/industries.ts** — append 3 entries after the `hvac` entry, before `] as const satisfies Industry[]`.
Match the existing formatting exactly (2-space indent, trailing commas, `projectTypes` one per line).
Exactly 5 projectTypes each. Keep them DISTINCT from painting / roofing / handyman and from each other:

```ts
  {
    id: 'home_improvement',
    label: 'Home Improvement',
    icon: 'HousePlus',
    projectTypes: [
      'Siding',
      'Window Replacement',
      'Door Replacement',
      'Decks & Porches',
      'Fencing',
    ],
  },
  {
    id: 'general_contracting',
    label: 'General Contracting',
    icon: 'HardHat',
    projectTypes: [
      'Home Addition',
      'New Construction',
      'Framing & Structural',
      'Permits & Inspections',
      'Project Management',
    ],
  },
  {
    id: 'remodeling',
    label: 'Remodeling',
    icon: 'Ruler',
    projectTypes: [
      'Kitchen Remodel',
      'Bathroom Remodel',
      'Basement Finishing',
      'Flooring',
      'Cabinetry & Countertops',
    ],
  },
```

**components/onboarding/industry-selector.tsx** — none of the 3 icons are imported yet
(the current import only covers the existing 10 + MoreHorizontal). Add `HousePlus, HardHat, Ruler`
to the single-line `lucide-react` import on line 4 AND add the three keys to `ICON_MAP`
(after `Fan`, before `MoreHorizontal`). Import and map key must be added together —
a missing ICON_MAP key renders no icon at all.

**tests/unit/industries.test.ts** — two edits:
1. `it('has exactly 10 entries')` → `it('has exactly 13 entries')` and `toHaveLength(10)` → `toHaveLength(13)`.
2. In the `'contains all known industries'` test, append `'home_improvement'`, `'general_contracting'`,
   `'remodeling'` to the `expected` array (after `'hvac'`).
  </action>
  <verify>
    <automated>npx tsc -p tsconfig.ci.json &amp;&amp; npx vitest run tests/unit/industries.test.ts</automated>
    <manual>Cross-check every icon string has an ICON_MAP key:
`grep -o "icon: '[A-Za-z]*'" lib/industries.ts | sed "s/.*'\(.*\)'/\1/" | sort -u` — every name printed
must also appear in the ICON_MAP block of components/onboarding/industry-selector.tsx.</manual>
  </verify>
  <done>INDUSTRIES has 13 entries; tsc clean; industries.test.ts green; all 13 icon strings present in both the lucide import and ICON_MAP.</done>
</task>

<task type="auto">
  <name>Task 2: Add the 3 price-book seed templates</name>
  <files>lib/price-book-seed.ts</files>
  <action>
Add three new keys to `INDUSTRY_PRICE_BOOK` after the `hvac` block (before the closing `}` at ~line 610),
separated by a blank line like the existing entries. 3 folders each, 6–8 items per folder.

Style rules (copy the `handyman` / `roofing` entries as reference):
- Realistic US national-average pricing (materials + labor installed, unless the item says labor-only).
- `unit` MUST be one of the values already used in this file: `hr`, `each`, `sqft`, `lf`, `job`, `sq`, `visit`, `room`.
  Do not introduce a new unit string.
- `notes` on most items, giving a range (`'Typical $X–$Y'`) or a scope qualifier (`'Labor only'`,
  `'Materials + labor'`). Use the en-dash `–` in ranges, as the existing file does.
- `image_url: PX(<id>)` — ONLY IDs from the `<allowed_pexels_ids>` list in context. Reusing the same
  ID across folders of one trade is fine (roofing/hvac already do this).

Folder names — use exactly these (verified not to collide with any existing name or each other;
`buildMergedFolders` de-dupes by name, so a collision would silently drop the folder for a
multi-trade company):

```
home_improvement:     'Siding & Exterior'  ·  'Windows & Entry Doors'  ·  'Decks, Porches & Fencing'
general_contracting:  'Framing & Structural'  ·  'Additions & New Construction'  ·  'Permits, Management & Site Work'
remodeling:           'Kitchen Remodeling'  ·  'Bathroom Remodeling'  ·  'Flooring & Basement Finishing'
```

Suggested PX ids (any from the allowed list is acceptable):
home_improvement → PX(186461); general_contracting → PX(1145434); remodeling → PX(1453499).

Content guidance so the three stay semantically distinct (per the scope's separation):
- **home_improvement** = whole-home exterior/interior upgrades, HIC-style work. e.g. vinyl siding
  per sqft, fiber cement siding per sqft, soffit/fascia per lf, house wrap; vinyl double-hung
  replacement window each, bay window each, entry door each, sliding patio door each, storm door each;
  pressure-treated deck per sqft, composite deck per sqft, deck railing per lf, deck staining/sealing
  per sqft, wood privacy fence per lf, vinyl fence per lf, gate each.
- **general_contracting** = larger builds, additions, structural, PM/permits. e.g. wall framing per lf,
  load-bearing wall removal + beam job, joist sistering each, subfloor per sqft, egress/header opening job;
  single-story addition per sqft, second-story addition per sqft, garage conversion job, ADU/detached
  build per sqft, foundation slab per sqft; building permit each, architectural/engineering plans job,
  GC overhead & profit (% is not a unit here — express as a `job` line or an `hr` PM rate), dumpster
  per each, site prep/demo per sqft, port-a-john per each.
- **remodeling** = kitchen / bath / basement renovation. e.g. mid-range kitchen remodel job,
  cabinet install per lf, quartz countertop per sqft, backsplash tile per sqft, sink/faucet each,
  appliance install each; full bath remodel job, tub-to-shower conversion job, tile shower surround
  per sqft, vanity install each, toilet install each; LVP flooring per sqft, hardwood per sqft,
  tile flooring per sqft, basement finishing per sqft, drop/drywall ceiling per sqft, egress window each.

Do NOT reuse any handyman item wording verbatim — these are renovation-scale line items, not odd jobs.
  </action>
  <verify>
    <automated>npx tsc -p tsconfig.ci.json</automated>
    <manual>Confirm no duplicate folder names across the whole map:
`grep -o "^      name: '[^']*'" lib/price-book-seed.ts | sort | uniq -d` → must print NOTHING.
Confirm no invented Pexels ids:
`grep -o 'PX([0-9]*)' lib/price-book-seed.ts | sort -u` → every id must be in the allowed list.</manual>
  </verify>
  <done>INDUSTRY_PRICE_BOOK has home_improvement, general_contracting and remodeling keys with 3 folders each; tsc clean; zero duplicate folder names; zero new Pexels ids.</done>
</task>

</tasks>

<verification>
Run the full CI gates from the repo root. Do NOT pipe vitest through `tail`/`head` — the pipe's
exit code masks vitest's real one (known false-green trap):

```bash
npx tsc -p tsconfig.ci.json
npx vitest run tests/unit tests/eval > vitest.log 2>&1; echo "EXIT=$?"
```

Then read `vitest.log`. Expected: `EXIT=0`, or `EXIT=1` with ONLY the 2 known migration-shape
failures (they fail locally on Windows via CRLF and pass in CI). Any other failure must be fixed.
Delete `vitest.log` before committing.
</verification>

<success_criteria>
- `INDUSTRIES.length === 13`, ids include `home_improvement`, `general_contracting`, `remodeling`
- Every INDUSTRIES icon string resolves in ICON_MAP (all 3 new icons imported from lucide-react)
- `INDUSTRY_PRICE_BOOK` has all 3 new keys, 3 folders each, all `image_url` from the allowed PX id list
- `grep -o "^      name: '[^']*'" lib/price-book-seed.ts | sort | uniq -d` prints nothing
- `npx tsc -p tsconfig.ci.json` clean
- vitest tests/unit + tests/eval green apart from the 2 known CRLF migration-shape failures
- `lib/seo/industries.ts` and `lib/tax-rates.ts` untouched (`git status` shows exactly 4 changed files)
</success_criteria>

<output>
Commit as `feat(quick): add home improvement, general contracting & remodeling trades`.
Write the summary to `.planning/quick/260806-ngz-add-home-improvement-general-contracting/260806-ngz-SUMMARY.md`.
</output>
