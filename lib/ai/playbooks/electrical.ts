import type { Playbook } from './types'

export const electrical: Playbook = {
  id: 'electrical',
  label: 'Electrical',
  keywords: [
    'electric', 'electrician', 'outlet', 'receptacle', 'breaker', 'panel', 'circuit', 'wiring', 'rewire',
    'gfci', 'light fixture', 'recessed', 'can light', 'ev charger', 'generator', 'subpanel', 'switch',
    'eletricista', 'tomada', 'disjuntor', 'fiacao', 'electricista',
  ],
  aliases: ['electrical', 'electrician', 'eletricista', 'electric'],
  sections: ['Panel and service', 'Rough-in wiring', 'Devices and fixtures', 'Permit and inspection', 'Cleanup'],
  alwaysItemise: [
    'each circuit, outlet, switch and fixture type as its own line with quantity',
    'wire, conduit and boxes by length or count, separate from device labor',
    'panel, breakers and service upgrades as their own lines',
    'permit, inspection and utility coordination when required',
    'drywall access and patching when walls or ceilings are opened',
  ],
  defaultExclusions: [
    'drywall repair, texture and painting after access',
    'utility company fees and meter work',
    'asbestos, knob-and-tube or aluminum wiring remediation found in walls',
    'low-voltage, data and security wiring',
  ],
  units: [
    ['outlets, switches, fixtures, breakers', 'each'],
    ['wire or conduit run', 'linear ft'],
    ['panel or service upgrade, EV charger circuit', 'job'],
    ['troubleshooting and hourly work', 'hour'],
  ],
  formulas: [
    'Wire length = run distance x 1.15 for routing and slack, per circuit.',
    'Recessed lights: count x unit price; a typical room spacing is one can per 25 sq ft.',
    'Troubleshooting: hours = crew size x hours on site.',
  ],
  mandatory: [
    { label: 'No permit or inspection line', match: ['permit', 'inspect'] },
    { label: 'No cleanup or patching line', match: ['clean', 'patch', 'dispos', 'haul'] },
  ],
  synonyms: [
    ['outlet', 'receptacle', 'plug', 'tomada'],
    ['breaker', 'circuit breaker', 'disjuntor'],
    ['light', 'fixture', 'luminaire', 'lamp'],
    ['install', 'installation', 'replace', 'replacement', 'swap'],
  ],
  // DRAFT — owner review required (plan D7). First-draft USD sanity bands for ESTIMATOR_PRICE_BANDS
  // (default off); wide on purpose: they flag the implausible, not the merely cheap or dear.
  priceBands: [
    { concept: 'outlet or switch install', match: ['outlet', 'switch', 'receptacle'], bands: { 'each': [30, 400] } },
    { concept: 'light fixture install', match: ['light', 'fixture', 'fan'], bands: { 'each': [40, 900] } },
    { concept: 'panel upgrade', match: ['panel'], bands: { 'each': [800, 6000], 'job': [800, 6000] } },
    { concept: 'wire run', match: ['wire', 'romex', 'conduit'], bands: { 'linear ft': [1, 40] } },
    { concept: 'electrician labor', match: ['labor', 'service call'], bands: { 'hour': [50, 250] } },
  ],
  example: {
    scenario: 'Add two 20 A kitchen outlets on a new circuit and swap six bedroom outlets for tamper-resistant ones.',
    sections: [
      {
        title: 'Panel and service',
        items: [
          { description: '20 A breaker and dedicated kitchen circuit', quantity: 1, unit: 'each', unitPrice: 85, confidence: 'high', basis: 'one new circuit stated in the audio' },
        ],
      },
      {
        title: 'Rough-in wiring',
        items: [
          { description: '12/2 cable run from panel to kitchen, with boxes', quantity: 45, unit: 'linear ft', unitPrice: 3.25, confidence: 'medium', basis: 'estimated 40 ft run x 1.15 routing allowance' },
        ],
      },
      {
        title: 'Devices and fixtures',
        items: [
          { description: 'Install 20 A GFCI outlet in kitchen', quantity: 2, unit: 'each', unitPrice: 95, confidence: 'high', basis: 'two outlets stated in the audio' },
          { description: 'Replace outlet with tamper-resistant outlet', quantity: 6, unit: 'each', unitPrice: 28, confidence: 'high', basis: 'six outlets stated in the audio' },
        ],
      },
      {
        title: 'Permit and inspection',
        items: [
          { description: 'Electrical permit and inspection', quantity: 1, unit: 'job', unitPrice: 150, confidence: 'low', basis: 'fee varies by city' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Wall access patching and cleanup', quantity: 1, unit: 'job', unitPrice: 120, confidence: 'medium', basis: 'one wall opened for the run' },
        ],
      },
    ],
    assumptions: ['Panel has space for a new breaker', 'Attic or basement access along the cable route'],
    exclusions: ['Painting and texture after patching', 'Panel replacement'],
    openQuestion: 'Is there free space in the panel for another breaker?',
  },
}
