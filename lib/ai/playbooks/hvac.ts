import type { Playbook } from './types'

export const hvac: Playbook = {
  id: 'hvac',
  label: 'HVAC',
  keywords: [
    'hvac', 'furnace', 'air conditioner', 'a/c', 'ac unit', 'heat pump', 'condenser', 'evaporator',
    'ductwork', 'duct', 'thermostat', 'mini split', 'refrigerant', 'air handler', 'tonnage',
    'ar condicionado', 'climatizacao', 'aire acondicionado', 'calefaccion',
  ],
  aliases: ['hvac', 'heating', 'air conditioning', 'a/c', 'refrigeration', 'ar condicionado'],
  sections: ['Equipment', 'Ductwork', 'Electrical and controls', 'Startup and commissioning', 'Cleanup'],
  alwaysItemise: [
    'each major piece of equipment (condenser, air handler, furnace, mini split head) with its size',
    'line set, pad or stand, drain line and disconnect as their own lines',
    'ductwork by length, plus registers and returns by count',
    'thermostat and controls',
    'permit, refrigerant charge, startup and haul-away of the old equipment',
  ],
  defaultExclusions: [
    'duct cleaning or sealing beyond the stated scope',
    'electrical service upgrades',
    'structural or roof work for equipment placement',
    'drywall and paint after duct work',
  ],
  units: [
    ['equipment install', 'each'],
    ['duct run, line set', 'linear ft'],
    ['registers, returns, thermostats', 'each'],
    ['full system replacement, startup', 'job'],
    ['diagnostic or hourly service', 'hour'],
  ],
  formulas: [
    'Cooling size: about 1 ton per 500-600 sq ft in a moderate climate; state the assumption.',
    'Duct run = measured length x 1.1 for fittings.',
    'Line set length = distance between indoor and outdoor units + 5 ft.',
  ],
  mandatory: [
    { label: 'No startup or commissioning line', match: ['startup', 'start-up', 'commission', 'test', 'charge'] },
    { label: 'No haul-away or cleanup line', match: ['haul', 'dispos', 'remov', 'clean'] },
  ],
  synonyms: [
    ['air conditioner', 'ac', 'a/c', 'condenser', 'cooling unit'],
    ['furnace', 'heater', 'heating unit'],
    ['install', 'installation', 'replace', 'replacement', 'swap'],
    ['duct', 'ductwork', 'ducting'],
  ],
  // DRAFT — owner review required (plan D7). First-draft USD sanity bands for ESTIMATOR_PRICE_BANDS
  // (default off); wide on purpose: they flag the implausible, not the merely cheap or dear.
  priceBands: [
    { concept: 'AC or furnace replacement', match: ['condenser', 'furnace', 'air handler', 'heat pump', 'air conditioner'], bands: { 'each': [1500, 20000], 'job': [1500, 20000] } },
    { concept: 'duct work', match: ['duct'], bands: { 'linear ft': [8, 120] } },
    { concept: 'HVAC technician labor', match: ['labor', 'service call', 'diagnostic', 'tune'], bands: { 'hour': [60, 250] } },
  ],
  example: {
    scenario: 'Replace a 3 ton split AC system (condenser and coil) on an existing furnace.',
    sections: [
      {
        title: 'Equipment',
        items: [
          { description: '3 ton condenser, supplied and set on new pad', quantity: 1, unit: 'each', unitPrice: 2650, confidence: 'high', basis: 'tonnage read from the data plate in the photo' },
          { description: 'Evaporator coil matched to the furnace', quantity: 1, unit: 'each', unitPrice: 980, confidence: 'high', basis: 'coil replaced with the condenser' },
          { description: 'Refrigerant line set', quantity: 25, unit: 'linear ft', unitPrice: 14, confidence: 'medium', basis: 'unit locations estimated from the photos' },
        ],
      },
      {
        title: 'Electrical and controls',
        items: [
          { description: 'Disconnect, whip and thermostat wiring', quantity: 1, unit: 'job', unitPrice: 210, confidence: 'medium', basis: 'standard for a swap' },
        ],
      },
      {
        title: 'Startup and commissioning',
        items: [
          { description: 'Evacuate, charge, startup and airflow check', quantity: 1, unit: 'job', unitPrice: 320, confidence: 'high', basis: 'required for any new system' },
          { description: 'Permit', quantity: 1, unit: 'job', unitPrice: 140, confidence: 'low', basis: 'fee varies by city' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Remove and haul away old condenser and coil', quantity: 1, unit: 'job', unitPrice: 150, confidence: 'high', basis: 'standard for a replacement' },
        ],
      },
    ],
    assumptions: ['Existing furnace and ductwork are in working order and reused', 'Existing electrical circuit is adequate'],
    exclusions: ['Duct sealing', 'Furnace replacement'],
    openQuestion: 'Is the existing furnace compatible with the new coil?',
  },
}
