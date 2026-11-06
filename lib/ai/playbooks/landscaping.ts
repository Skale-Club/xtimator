import type { Playbook } from './types'

export const landscaping: Playbook = {
  id: 'landscaping',
  label: 'Landscaping',
  keywords: [
    'landscap', 'lawn', 'mowing', 'sod', 'turf', 'mulch', 'irrigation', 'sprinkler', 'paver',
    'retaining wall', 'shrub', 'tree trimming', 'hedge', 'planting', 'garden', 'gramado',
    'jardim', 'paisagismo', 'cesped',
  ],
  aliases: ['landscaping', 'lawn care', 'lawn', 'garden', 'tree service', 'irrigation', 'paisagismo', 'hardscape'],
  sections: ['Site prep', 'Hardscape', 'Planting', 'Irrigation', 'Lawn care', 'Cleanup'],
  alwaysItemise: [
    'site prep: grading, excavation, old material removal',
    'base material (gravel, sand, soil) separately from the surface material',
    'delivery or dump fees, and disposal of green waste and spoils',
    'irrigation changes when planting or sod is added',
    'edging and weed barrier when beds are built or refreshed',
  ],
  defaultExclusions: [
    'underground utility locating beyond the standard call',
    'permits and HOA approval',
    'plant replacement after the warranty period',
    'repair of existing irrigation or drainage not part of the scope',
  ],
  units: [
    ['sod, turf, seed, lawn treatments', 'sq ft'],
    ['mulch, soil, gravel, topsoil', 'cu yd'],
    ['edging, fencing, retaining wall length', 'linear ft'],
    ['plants, shrubs, trees, sprinkler heads', 'each'],
    ['crew labor billed by time', 'hour'],
  ],
  formulas: [
    'Area = length x width; for irregular beds split into rectangles and add.',
    'Mulch or soil volume in cu yd = area (sq ft) x depth (ft) / 27; 3 inches of mulch = 0.25 ft.',
    'Pavers and sod: add 10% for waste and cuts.',
    'Retaining wall face area = length x height.',
  ],
  mandatory: [
    { label: 'No site prep or grading line', match: ['prep', 'grade', 'grading', 'excavat', 'clear', 'remov'] },
    { label: 'No cleanup or disposal line', match: ['clean', 'dispos', 'haul', 'dump', 'debris', 'waste'] },
  ],
  synonyms: [
    ['mow', 'mowing', 'cut'],
    ['sod', 'turf'],
    ['mulch', 'bark'],
    ['shrub', 'bush', 'shrubs'],
    ['sprinkler', 'irrigation'],
  ],
  example: {
    scenario: 'Front bed refresh: remove old plants, new mulch, six shrubs, drip line.',
    sections: [
      {
        title: 'Site prep',
        items: [
          { description: 'Remove old plants and weeds, grade bed', quantity: 120, unit: 'sq ft', unitPrice: 2.5, confidence: 'medium', basis: 'bed about 30 x 4 ft, estimated from the photo' },
        ],
      },
      {
        title: 'Planting',
        items: [
          { description: 'Supply and plant shrubs, 3 gal', quantity: 6, unit: 'each', unitPrice: 48, confidence: 'high', basis: 'six shrubs stated in the audio' },
          { description: 'Mulch, 3 inch depth, delivered and spread', quantity: 1.5, unit: 'cu yd', unitPrice: 85, confidence: 'medium', basis: '120 sq ft x 0.25 ft / 27, rounded up' },
          { description: 'Landscape edging', quantity: 34, unit: 'linear ft', unitPrice: 3.5, confidence: 'medium', basis: 'bed perimeter estimated from the photo' },
        ],
      },
      {
        title: 'Irrigation',
        items: [
          { description: 'Drip line for new shrubs', quantity: 1, unit: 'job', unitPrice: 180, confidence: 'medium', basis: 'six shrubs on one zone' },
        ],
      },
      {
        title: 'Cleanup',
        items: [
          { description: 'Haul away green waste and debris', quantity: 1, unit: 'job', unitPrice: 90, confidence: 'high', basis: 'standard for one bed' },
        ],
      },
    ],
    assumptions: ['Existing soil is workable without amendment', 'Water and access available on site'],
    exclusions: ['Tree removal', 'Irrigation repairs outside the new bed'],
    openQuestion: 'Is there existing irrigation to tie the new drip line into?',
  },
}
