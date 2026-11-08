import type { Playbook } from './types'

export const plumbing: Playbook = {
  id: 'plumbing',
  label: 'Plumbing',
  keywords: [
    'plumb', 'pipe', 'leak', 'drain', 'clog', 'toilet', 'faucet', 'water heater', 'sewer', 'shower valve',
    'garbage disposal', 'sump', 'repipe', 'fixture', 'encanamento', 'vazamento', 'vaso sanitario',
    'plomeria', 'fontaneria',
  ],
  aliases: ['plumbing', 'plumber', 'encanador', 'drain', 'water heater'],
  sections: ['Demo and access', 'Supply and drain', 'Fixtures', 'Water heater', 'Testing and cleanup'],
  alwaysItemise: [
    'each fixture or appliance (toilet, faucet, water heater) as its own line with labor and parts clear',
    'supply lines, shutoff valves, wax rings, P-traps and fittings that are replaced',
    'drywall or tile access and the patch afterwards when walls must be opened',
    'permit and inspection when the work requires one',
    'haul-away of the old fixture or tank',
  ],
  defaultExclusions: [
    'drywall finishing, painting and tile repair after access cuts',
    'repair of hidden pipe damage found once walls are open',
    'permit fees paid to the city',
    'mold or asbestos remediation',
  ],
  units: [
    ['fixture or appliance install', 'each'],
    ['pipe replaced or run', 'linear ft'],
    ['diagnostic or hourly service call', 'hour'],
    ['water heater swap, repipe, sewer repair', 'job'],
  ],
  formulas: [
    'Pipe run = measured length of each run in linear ft plus 10% for fittings.',
    'Time-and-materials jobs: hours = crew size x hours on site, plus parts at cost with markup.',
  ],
  mandatory: [
    { label: 'No haul-away or disposal line', match: ['haul', 'dispos', 'remov', 'dump'] },
    { label: 'No cleanup or testing line', match: ['clean', 'test', 'inspect', 'pressure'] },
  ],
  synonyms: [
    ['toilet', 'commode', 'wc', 'vaso'],
    ['faucet', 'tap', 'mixer'],
    ['install', 'installation', 'replace', 'replacement', 'swap'],
    ['water heater', 'hot water tank'],
  ],
  // DRAFT — owner review required (plan D7). First-draft USD sanity bands for ESTIMATOR_PRICE_BANDS
  // (default off); wide on purpose: they flag the implausible, not the merely cheap or dear.
  priceBands: [
    { concept: 'fixture install (toilet, faucet)', match: ['toilet', 'faucet', 'sink'], bands: { 'each': [60, 1500] } },
    { concept: 'water heater swap', match: ['water heater'], bands: { 'each': [400, 5000] } },
    { concept: 'pipe run', match: ['pipe', 'repipe'], bands: { 'linear ft': [3, 60] } },
    { concept: 'plumber labor', match: ['labor', 'service call', 'diagnostic'], bands: { 'hour': [50, 250] } },
  ],
  example: {
    scenario: 'Replace a 40 gallon gas water heater and one leaking kitchen faucet.',
    sections: [
      {
        title: 'Fixtures',
        items: [
          { description: 'Replace kitchen faucet (customer-supplied)', quantity: 1, unit: 'each', unitPrice: 165, confidence: 'high', basis: 'one faucet stated in the audio' },
          { description: 'New supply lines and shutoff valves for the faucet', quantity: 1, unit: 'job', unitPrice: 40, confidence: 'medium', basis: 'standard parts' },
        ],
      },
      {
        title: 'Water heater',
        items: [
          { description: 'Remove and haul away old 40 gal water heater', quantity: 1, unit: 'each', unitPrice: 85, confidence: 'high', basis: 'one unit stated in the audio' },
          { description: '40 gal gas water heater, supplied and installed', quantity: 1, unit: 'each', unitPrice: 1250, confidence: 'high', basis: 'size read from the photo of the nameplate' },
          { description: 'Flex connectors, gas line fittings and shutoff valve', quantity: 1, unit: 'job', unitPrice: 95, confidence: 'medium', basis: 'typical for a swap' },
          { description: 'Permit and inspection', quantity: 1, unit: 'job', unitPrice: 120, confidence: 'low', basis: 'permit fee varies by city' },
        ],
      },
      {
        title: 'Testing and cleanup',
        items: [
          { description: 'Pressure and leak test, cleanup', quantity: 1, unit: 'job', unitPrice: 50, confidence: 'high', basis: 'standard for both items' },
        ],
      },
    ],
    assumptions: ['Existing venting meets code and is reused', 'Water heater is accessible without opening walls'],
    exclusions: ['Drywall or paint repair', 'Gas line upgrades if the existing line is undersized'],
    openQuestion: 'Does the existing vent pipe need replacing?',
  },
}
