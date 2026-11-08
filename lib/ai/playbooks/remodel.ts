import type { Playbook } from './types'

export const remodel: Playbook = {
  id: 'remodel',
  label: 'Remodel and construction',
  keywords: [
    'remodel', 'renovat', 'demo', 'demolition', 'framing', 'drywall', 'tile', 'flooring', 'cabinet',
    'countertop', 'bathroom remodel', 'kitchen remodel', 'deck', 'addition', 'subfloor', 'insulation',
    'carpentry', 'handyman', 'reforma', 'obra', 'demolicao', 'piso', 'azulejo', 'remodelacion',
  ],
  aliases: ['remodel', 'remodeling', 'construction', 'general contractor', 'contractor', 'carpentry', 'handyman', 'flooring', 'reforma', 'renovation'],
  sections: ['Demo', 'Rough', 'Finish', 'Cleanup'],
  alwaysItemise: [
    'demolition and haul-away or dumpster, separate from the build',
    'rough work (framing, rough plumbing and electrical, subfloor, insulation) apart from finish work',
    'finish materials (tile, flooring, cabinets, fixtures) separate from the labor to install them',
    'permits, inspections and engineering when the job needs them',
    'cleanup and final haul-away',
  ],
  defaultExclusions: [
    'hidden damage, rot, mold or code upgrades found after demolition',
    'asbestos or lead abatement',
    'appliances and owner-supplied fixtures unless listed',
    'architect, engineer and design fees',
  ],
  units: [
    ['flooring, tile, drywall, decking area', 'sq ft'],
    ['trim, base, framing, railing length', 'linear ft'],
    ['fixtures, cabinets, doors, windows', 'each'],
    ['demo, dumpster, permit, cleanup', 'job'],
    ['carpentry billed by time', 'hour'],
  ],
  formulas: [
    'Floor or wall area = length x width (or perimeter x height) minus openings; add 10% waste for tile and flooring.',
    'Drywall sheets = area / 32 sq ft per 4 x 8 sheet, rounded up.',
    'Labor billed by time: hours = crew size x days x 8.',
  ],
  mandatory: [
    { label: 'No demolition or removal line', match: ['demo', 'remov', 'tear', 'strip'] },
    { label: 'No disposal or dumpster line', match: ['dispos', 'haul', 'dumpster', 'debris'] },
    { label: 'No cleanup line', match: ['clean'] },
  ],
  synonyms: [
    ['demo', 'demolition', 'tear out', 'remove'],
    ['flooring', 'floor', 'floors'],
    ['cabinet', 'cabinets', 'cabinetry'],
    ['install', 'installation', 'installed', 'replace'],
  ],
  // DRAFT — owner review required (plan D7). First-draft USD sanity bands for ESTIMATOR_PRICE_BANDS
  // (default off); wide on purpose: they flag the implausible, not the merely cheap or dear.
  priceBands: [
    { concept: 'tile installation', match: ['tile'], bands: { 'sq ft': [4, 40] } },
    { concept: 'flooring installation', match: ['flooring', 'laminate', 'hardwood', 'vinyl plank'], bands: { 'sq ft': [2, 25] } },
    { concept: 'drywall install and finish', match: ['drywall'], bands: { 'sq ft': [1.5, 12] } },
    { concept: 'cabinet install', match: ['cabinet'], bands: { 'linear ft': [60, 1200] } },
    { concept: 'carpenter or crew labor', match: ['labor', 'carpenter'], bands: { 'hour': [30, 150] } },
  ],
  example: {
    scenario: 'Remodel a 5 x 8 ft bathroom: new tile floor, vanity and toilet.',
    sections: [
      {
        title: 'Demo',
        items: [
          { description: 'Demo old floor, vanity and toilet; haul away', quantity: 1, unit: 'job', unitPrice: 450, confidence: 'high', basis: 'full bathroom stated in the audio' },
        ],
      },
      {
        title: 'Rough',
        items: [
          { description: 'Subfloor repair and underlayment', quantity: 40, unit: 'sq ft', unitPrice: 4.5, confidence: 'medium', basis: '5 x 8 ft room stated in the audio' },
        ],
      },
      {
        title: 'Finish',
        items: [
          { description: 'Porcelain floor tile, supplied and installed', quantity: 44, unit: 'sq ft', unitPrice: 14, confidence: 'high', basis: '40 sq ft + 10% waste' },
          { description: 'Vanity with top and faucet, installed', quantity: 1, unit: 'each', unitPrice: 780, confidence: 'medium', basis: 'size estimated from the photo' },
          { description: 'Toilet, supplied and installed', quantity: 1, unit: 'each', unitPrice: 360, confidence: 'high', basis: 'one toilet stated in the audio' },
          { description: 'Baseboard trim, installed and painted', quantity: 26, unit: 'linear ft', unitPrice: 5, confidence: 'medium', basis: 'perimeter 26 ft of the 5 x 8 ft room' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Final cleanup', quantity: 1, unit: 'job', unitPrice: 120, confidence: 'high', basis: 'standard' },
        ],
      },
    ],
    assumptions: ['Subfloor needs only minor repair', 'Existing plumbing locations are reused'],
    exclusions: ['Shower or tub work', 'Repair of hidden water damage'],
    openQuestion: 'Does the owner supply the vanity and toilet, or are they included?',
  },
}
