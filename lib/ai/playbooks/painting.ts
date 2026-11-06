import type { Playbook } from './types'

export const painting: Playbook = {
  id: 'painting',
  label: 'Painting',
  keywords: [
    'paint', 'painting', 'repaint', 'primer', 'coats', 'drywall patch', 'baseboard',
    'cabinet refinish', 'deck stain', 'pintura', 'pintar', 'tinta',
  ],
  aliases: ['painting', 'painter', 'paint', 'pintura', 'drywall'],
  sections: ['Prep and protection', 'Walls', 'Ceilings', 'Trim and doors', 'Exterior', 'Cleanup'],
  alwaysItemise: [
    'prep: surface cleaning, patching, sanding, caulking, masking and floor protection',
    'primer separately from finish coats when bare, stained or repaired surfaces need it',
    'ceilings, trim, doors and cabinets as their own lines, never folded into wall area',
    'paint and supplies as materials when the company supplies them',
    'cleanup and disposal of used materials',
  ],
  defaultExclusions: [
    'moving or storing furniture',
    'lead-safe work on pre-1978 homes beyond standard prep',
    'repair of structural damage or rot found under the paint',
    'color changes after paint is mixed',
  ],
  units: [
    ['wall or ceiling area', 'sq ft'],
    ['trim, baseboard, crown', 'linear ft'],
    ['doors, windows, cabinet doors', 'each'],
    ['prep and protection for a room', 'job'],
    ['paint by the gallon', 'each'],
  ],
  formulas: [
    'Wall area = room perimeter x ceiling height - openings (about 20 sq ft per door, 15 per window).',
    'Ceiling area = length x width of the room.',
    'Paint = coverage area / 350 sq ft per gallon, per coat; round up to whole gallons.',
    'Baseboard length = room perimeter - door widths.',
  ],
  mandatory: [
    { label: 'No prep or protection line', match: ['prep', 'protect', 'mask', 'tape', 'cover', 'drop cloth', 'patch', 'sand'] },
    { label: 'No cleanup line', match: ['clean', 'dispos', 'haul', 'debris', 'limpeza'] },
  ],
  synonyms: [
    ['paint', 'painting', 'repaint', 'coat'],
    ['baseboard', 'baseboards', 'base'],
    ['wall', 'walls'],
    ['ceiling', 'ceilings'],
    ['prime', 'primer', 'priming'],
  ],
  example: {
    scenario: 'Repaint walls, ceiling and trim of a 12 x 14 ft bedroom with 8 ft ceilings.',
    sections: [
      {
        title: 'Prep and protection',
        items: [
          { description: 'Patch, sand and caulk; mask and protect floors', quantity: 1, unit: 'job', unitPrice: 160, confidence: 'medium', basis: 'standard prep for one room' },
        ],
      },
      {
        title: 'Walls',
        items: [
          { description: 'Prime and paint walls, two coats', quantity: 340, unit: 'sq ft', unitPrice: 1.9, confidence: 'high', basis: 'perimeter 52 ft x 8 ft - 76 sq ft of openings, from the stated 12 x 14 ft room' },
        ],
      },
      {
        title: 'Ceilings',
        items: [
          { description: 'Paint ceiling, two coats', quantity: 168, unit: 'sq ft', unitPrice: 1.4, confidence: 'high', basis: '12 x 14 ft room stated in the audio' },
        ],
      },
      {
        title: 'Trim and doors',
        items: [
          { description: 'Paint baseboards', quantity: 49, unit: 'linear ft', unitPrice: 2.2, confidence: 'medium', basis: 'perimeter 52 ft minus one 3 ft door' },
          { description: 'Paint door and frame, both sides', quantity: 1, unit: 'each', unitPrice: 95, confidence: 'high', basis: 'one door seen in the photo' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Cleanup and disposal of used materials', quantity: 1, unit: 'job', unitPrice: 45, confidence: 'high', basis: 'standard for one room' },
        ],
      },
    ],
    assumptions: ['Walls are in sound condition; patching is minor', 'Owner approves colors before the start date'],
    exclusions: ['Furniture moving', 'Closet interiors'],
    openQuestion: 'Should the closet interior be painted as well?',
  },
}
