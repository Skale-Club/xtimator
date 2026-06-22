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

/** Sentinel id used by legacy multi-select to represent a free-text "Other" trade. */
export const OTHER_INDUSTRY_ID = 'other'

const KNOWN_INDUSTRY_IDS = new Set(INDUSTRIES.map((i) => i.id))

export function isKnownIndustry(id: string): boolean {
  return KNOWN_INDUSTRY_IDS.has(id)
}

/**
 * Resolve the multi-select state into the canonical `industries` array persisted
 * on the company.
 *
 * - Known ids are emitted in INDUSTRIES display order (deterministic).
 * - Custom (unknown) strings are appended after known ids, preserving insertion
 *   order and deduping.
 * - The legacy 'other' sentinel is dropped; custom strings are persisted directly.
 */
export function resolveIndustries(values: string[]): string[] {
  const selected = new Set(values.filter(Boolean))
  const result: string[] = []
  const seen = new Set<string>()

  for (const ind of INDUSTRIES) {
    if (selected.has(ind.id) && !seen.has(ind.id)) {
      result.push(ind.id)
      seen.add(ind.id)
    }
  }

  for (const value of values) {
    if (!value || isKnownIndustry(value) || value === OTHER_INDUSTRY_ID) continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    result.push(trimmed)
    seen.add(trimmed)
  }

  return result
}

/**
 * Split a persisted `industries` array into the component-friendly shape.
 *
 * - Known ids map to selected predefined industries.
 * - Unknown strings become custom industries.
 * - The legacy 'other' sentinel is ignored.
 */
export function splitIndustries(
  industries: string[] | null | undefined
): {
  selectedIds: string[]
  customIndustries: string[]
} {
  const list = (industries ?? []).filter(Boolean)
  const selectedIds: string[] = []
  const customIndustries: string[] = []

  for (const value of list) {
    if (value === OTHER_INDUSTRY_ID) continue
    if (isKnownIndustry(value)) {
      selectedIds.push(value)
    } else {
      customIndustries.push(value)
    }
  }

  return { selectedIds, customIndustries }
}

/**
 * Build a display label for a single industry value.
 */
export function getIndustryLabel(value: string): string {
  const known = INDUSTRIES.find((i) => i.id === value)
  return known?.label ?? value
}
