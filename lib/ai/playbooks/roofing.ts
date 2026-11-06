import type { Playbook } from './types'

export const roofing: Playbook = {
  id: 'roofing',
  label: 'Roofing',
  keywords: [
    'roof', 'roofing', 'shingle', 'shingles', 'flashing', 'underlayment', 'gutter', 'soffit', 'fascia',
    'ridge', 'tear off', 'tear-off', 'skylight', 'metal roof', 'telhado', 'telha', 'techo', 'tejas',
  ],
  aliases: ['roofing', 'roofer', 'telhado', 'gutters'],
  sections: ['Tear-off', 'Underlayment', 'Shingles', 'Flashing', 'Cleanup'],
  alwaysItemise: [
    'tear-off of the old roof and dump or disposal fees, by the square',
    'decking repair priced per sheet, as an allowance when not yet inspected',
    'underlayment, ice and water shield, drip edge and starter strip',
    'shingles by the square including the waste allowance, ridge cap and vents',
    'flashing for chimneys, valleys, walls and pipe boots',
    'permit, magnet sweep and cleanup',
  ],
  defaultExclusions: [
    'rotted decking or framing found after tear-off, beyond the stated allowance',
    'interior water-damage repair',
    'gutter replacement unless listed',
    'solar panel detach and reset',
  ],
  units: [
    ['tear-off, underlayment, shingles', 'sq ft'],
    ['ridge, drip edge, valley, gutters', 'linear ft'],
    ['pipe boots, vents, skylights, decking sheets', 'each'],
    ['permit, cleanup, full re-roof', 'job'],
  ],
  formulas: [
    'A roofing square is 100 sq ft; roof area = footprint area x pitch factor (6/12 is about 1.12, 8/12 about 1.20).',
    'Shingles: squares x 1.10 waste (1.15 on complex hips and valleys); 3 bundles per square.',
    'Ridge length = sum of ridge and hip lines; drip edge = eaves + rakes.',
  ],
  mandatory: [
    { label: 'No tear-off or disposal line', match: ['tear', 'remov', 'dispos', 'haul', 'dump'] },
    { label: 'No flashing line', match: ['flash', 'boot', 'valley'] },
    { label: 'No cleanup line', match: ['clean', 'magnet', 'debris'] },
  ],
  synonyms: [
    ['shingle', 'shingles', 'asphalt'],
    ['tear off', 'tear-off', 'tearoff', 'remove', 'removal'],
    ['underlayment', 'felt', 'synthetic underlayment'],
    ['gutter', 'gutters'],
  ],
  example: {
    scenario: 'Re-roof a 2,000 sq ft footprint, 6/12 pitch, one layer of asphalt shingles.',
    sections: [
      {
        title: 'Tear-off',
        items: [
          { description: 'Tear off one layer of asphalt shingles and dispose', quantity: 2240, unit: 'sq ft', unitPrice: 0.75, confidence: 'medium', basis: '2,000 sq ft footprint x 1.12 pitch factor, stated 6/12' },
          { description: 'Replace damaged decking, allowance', quantity: 4, unit: 'each', unitPrice: 85, confidence: 'low', basis: 'sheets unknown until tear-off' },
        ],
      },
      {
        title: 'Underlayment',
        items: [
          { description: 'Synthetic underlayment and ice and water shield at eaves', quantity: 2240, unit: 'sq ft', unitPrice: 0.55, confidence: 'medium', basis: 'same roof area' },
          { description: 'Drip edge', quantity: 180, unit: 'linear ft', unitPrice: 2.4, confidence: 'low', basis: 'eaves and rakes estimated from the footprint' },
        ],
      },
      {
        title: 'Shingles',
        items: [
          { description: 'Architectural shingles with ridge cap', quantity: 2464, unit: 'sq ft', unitPrice: 2.9, confidence: 'medium', basis: '2,240 sq ft + 10% waste' },
        ],
      },
      {
        title: 'Flashing',
        items: [
          { description: 'Pipe boots, step and valley flashing', quantity: 1, unit: 'job', unitPrice: 650, confidence: 'medium', basis: 'three pipes and one valley seen in the photos' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Permit, magnet sweep and site cleanup', quantity: 1, unit: 'job', unitPrice: 420, confidence: 'medium', basis: 'standard for a full re-roof' },
        ],
      },
    ],
    assumptions: ['One layer of existing shingles', 'Decking is sound except for the allowance'],
    exclusions: ['Gutter replacement', 'Interior water-damage repair'],
    openQuestion: 'Is there a second layer of shingles under the visible one?',
  },
}
