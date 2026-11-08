import type { Playbook } from './types'

export const cleaning: Playbook = {
  id: 'cleaning',
  label: 'Cleaning',
  keywords: [
    'clean', 'cleaning', 'maid', 'janitorial', 'housekeeping', 'move-out', 'move out', 'deep clean',
    'carpet', 'upholstery', 'couch', 'sofa', 'window washing', 'pressure wash', 'steam',
    'limpeza', 'faxina', 'higienizacao', 'limpieza',
  ],
  aliases: ['cleaning', 'janitorial', 'maid', 'housekeeping', 'carpet cleaning', 'pressure washing'],
  sections: ['Areas', 'Add-ons', 'Supplies and equipment'],
  alwaysItemise: [
    'each distinct area or room type (kitchen, bathrooms, bedrooms, living areas) as its own line',
    'inside appliances (oven, fridge), interior windows, blinds, baseboards, garage and patio as add-ons',
    'a heavy-soil or first-time-clean surcharge when the condition calls for it',
    'travel or trip charge when the site is outside the normal service area',
  ],
  defaultExclusions: [
    'biohazard, mold and pest remediation',
    'moving furniture or heavy items',
    'exterior windows above the first floor',
    'repair of damaged surfaces',
  ],
  units: [
    ['room or area clean', 'each'],
    ['whole-home clean', 'job'],
    ['carpet, floor or upholstery treatment', 'sq ft'],
    ['crew labor billed by time', 'hour'],
    ['window cleaning', 'each'],
  ],
  formulas: [
    'Carpet or floor treatment: sq ft = length x width of each treated room; bill per sq ft or per room, not both.',
    'Crew time: hours = crew size x hours on site; use only when the client is billed by time.',
    'Upholstery: count seats or cushions and price each.',
  ],
  mandatory: [
    {
      label: 'No cleaning line for the main areas',
      match: ['clean', 'wash', 'vacuum', 'mop', 'dust', 'sanitiz', 'shampoo', 'steam', 'limpeza'],
    },
  ],
  synonyms: [
    ['couch', 'sofa', 'loveseat'],
    ['carpet', 'rug'],
    ['bathroom', 'restroom', 'washroom', 'bath'],
    ['clean', 'cleaning', 'wash', 'washing'],
  ],
  // DRAFT — owner review required (plan D7). First-draft USD sanity bands for ESTIMATOR_PRICE_BANDS
  // (default off); wide on purpose: they flag the implausible, not the merely cheap or dear.
  priceBands: [
    { concept: 'house cleaning by area', match: ['clean'], bands: { 'sq ft': [0.05, 1.5] } },
    { concept: 'hourly cleaning labor', match: ['clean', 'labor', 'maid'], bands: { 'hour': [20, 120] } },
    { concept: 'deep clean or move-out, per job', match: ['deep clean', 'move-out', 'move out'], bands: { 'job': [100, 1500] } },
  ],
  example: {
    scenario: 'Move-out clean of a 2 bedroom, 1 bath apartment, oven and fridge included.',
    sections: [
      {
        title: 'Areas',
        items: [
          { description: 'Kitchen deep clean (cabinets, counters, appliances outside)', quantity: 1, unit: 'each', unitPrice: 140, confidence: 'high', basis: 'one kitchen stated in the audio' },
          { description: 'Bathroom deep clean (tub, tile, toilet, vanity)', quantity: 1, unit: 'each', unitPrice: 75, confidence: 'high', basis: 'one bathroom stated in the audio' },
          { description: 'Bedroom clean (floors, closets, baseboards)', quantity: 2, unit: 'each', unitPrice: 55, confidence: 'high', basis: 'two bedrooms stated in the audio' },
          { description: 'Living area and hallway clean', quantity: 1, unit: 'each', unitPrice: 85, confidence: 'medium', basis: 'size estimated from the photo' },
        ],
      },
      {
        title: 'Add-ons',
        items: [
          { description: 'Inside oven clean', quantity: 1, unit: 'each', unitPrice: 45, confidence: 'high', basis: 'requested in the audio' },
          { description: 'Inside refrigerator clean', quantity: 1, unit: 'each', unitPrice: 40, confidence: 'high', basis: 'requested in the audio' },
          { description: 'Interior windows', quantity: 8, unit: 'each', unitPrice: 7, confidence: 'low', basis: 'window count estimated from the photos' },
        ],
      },
    ],
    assumptions: ['Apartment is empty at the time of cleaning', 'Normal soil level, no heavy buildup'],
    exclusions: ['Carpet shampooing', 'Wall washing'],
    openQuestion: 'Are the carpets to be shampooed, or only vacuumed?',
  },
}
