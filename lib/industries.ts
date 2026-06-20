export interface Industry {
  id: string
  label: string
  icon: string
  projectTypes: string[]
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'house_cleaning',
    label: 'House Cleaning',
    icon: 'SprayCan',
    projectTypes: [
      'Deep Cleaning',
      'Regular Maintenance',
      'Move-In/Out',
      'Post-Construction',
      'Recurring Service',
    ],
  },
  {
    id: 'upholstery_carpet_cleaning',
    label: 'Upholstery & Carpet Cleaning',
    icon: 'Sofa',
    projectTypes: [
      'Carpet Cleaning',
      'Upholstery Cleaning',
      'Area Rug Cleaning',
      'Stain Removal',
      'Pet Odor Treatment',
    ],
  },
  {
    id: 'window_cleaning',
    label: 'Window Cleaning',
    icon: 'Droplets',
    projectTypes: [
      'Residential Windows',
      'Storefront / Commercial',
      'Screen Cleaning',
      'Track & Sill Detailing',
      'Hard Water Removal',
    ],
  },
  {
    id: 'painting',
    label: 'Painting',
    icon: 'Paintbrush',
    projectTypes: [
      'Interior Painting',
      'Exterior Painting',
      'Cabinet Refinishing',
      'Staining',
      'Wallpaper',
    ],
  },
  {
    id: 'landscaping',
    label: 'Landscaping',
    icon: 'TreePine',
    projectTypes: [
      'Lawn Care',
      'Garden Design',
      'Hardscaping',
      'Tree Service',
      'Irrigation',
    ],
  },
  {
    id: 'electrical',
    label: 'Electrical',
    icon: 'Zap',
    projectTypes: [
      'Wiring',
      'Panel Upgrade',
      'Lighting',
      'EV Charger',
      'Troubleshooting',
    ],
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    icon: 'Wrench',
    projectTypes: [
      'Pipe Repair',
      'Fixture Install',
      'Water Heater',
      'Drain Cleaning',
      'Repiping',
    ],
  },
  {
    id: 'handyman',
    label: 'Handyman',
    icon: 'Hammer',
    projectTypes: [
      'General Repair',
      'Assembly',
      'Mounting',
      'Drywall',
      'Odd Jobs',
    ],
  },
  {
    id: 'roofing',
    label: 'Roofing',
    icon: 'Home',
    projectTypes: [
      'Roof Repair',
      'Replacement',
      'Inspection',
      'Gutter Install',
      'Flashing',
    ],
  },
  {
    id: 'hvac',
    label: 'HVAC',
    icon: 'Fan',
    projectTypes: [
      'AC Repair',
      'Furnace Repair',
      'Installation',
      'Duct Cleaning',
      'Maintenance',
    ],
  },
] as const satisfies Industry[]

/** Sentinel id used by the multi-select to represent a free-text "Other" trade. */
export const OTHER_INDUSTRY_ID = 'other'

const KNOWN_INDUSTRY_IDS = new Set(INDUSTRIES.map((i) => i.id))

/**
 * Resolve the multi-select state (selected card ids + the free-text "Other"
 * value) into the canonical `industries` array persisted on the company.
 *
 * - Known ids are emitted in INDUSTRIES display order (deterministic), so
 *   `result[0]` is a known industry id whenever any predefined trade is picked.
 * - The `'other'` sentinel is replaced by the trimmed custom text, appended last.
 * - Empties and duplicates are dropped.
 */
export function resolveIndustries(
  selectedIds: string[],
  customIndustry: string
): string[] {
  const selected = new Set(selectedIds.filter(Boolean))
  const result: string[] = []

  for (const ind of INDUSTRIES) {
    if (selected.has(ind.id)) result.push(ind.id)
  }

  if (selected.has(OTHER_INDUSTRY_ID)) {
    const custom = customIndustry.trim()
    if (custom && !result.includes(custom)) result.push(custom)
  }

  return result
}

/**
 * Reverse of {@link resolveIndustries}: split a persisted `industries` array
 * back into multi-select state. Known ids map to selected cards; the first
 * value that isn't a known id becomes the free-text "Other" entry.
 */
export function splitIndustries(industries: string[] | null | undefined): {
  selectedIds: string[]
  customIndustry: string
} {
  const list = (industries ?? []).filter(Boolean)
  const selectedIds: string[] = []
  let customIndustry = ''

  for (const value of list) {
    if (KNOWN_INDUSTRY_IDS.has(value)) {
      selectedIds.push(value)
    } else if (!customIndustry) {
      customIndustry = value
      selectedIds.push(OTHER_INDUSTRY_ID)
    }
  }

  return { selectedIds, customIndustry }
}
