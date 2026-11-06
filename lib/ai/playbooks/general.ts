import type { Playbook } from './types'

/**
 * Fallback for a trade the other playbooks do not cover. Deliberately plain: it
 * only enforces the structure contract (prep, main work, finish, cleanup), not
 * a trade's vocabulary.
 */
export const general: Playbook = {
  id: 'general',
  label: 'General services',
  keywords: [],
  aliases: ['general', 'general services', 'other'],
  sections: ['Preparation', 'Main work', 'Materials', 'Finish and cleanup'],
  alwaysItemise: [
    'preparation and protection',
    'each distinct task as its own line, labor apart from materials',
    'disposal or haul-away of removed material',
    'permits and fees when the job needs them',
    'cleanup',
  ],
  defaultExclusions: [
    'hidden conditions found once work starts',
    'permit and inspection fees unless listed',
    'work not described in the walkthrough',
  ],
  units: [
    ['countable items', 'each'],
    ['area', 'sq ft'],
    ['length', 'linear ft'],
    ['time-based work', 'hour'],
    ['lump-sum tasks', 'job'],
  ],
  formulas: [
    'Area = length x width; length of a perimeter = 2 x (length + width).',
    'Labor billed by time: hours = crew size x hours on site.',
  ],
  mandatory: [
    { label: 'No cleanup or disposal line', match: ['clean', 'dispos', 'haul', 'debris'] },
  ],
  synonyms: [
    ['install', 'installation', 'installed', 'replace', 'replacement'],
    ['remove', 'removal', 'demo', 'demolition', 'tear out'],
  ],
  example: {
    scenario: 'Install a 6 ft section of fence and a gate.',
    sections: [
      {
        title: 'Preparation',
        items: [
          { description: 'Remove old fence section and haul away', quantity: 1, unit: 'job', unitPrice: 120, confidence: 'high', basis: 'one section stated in the audio' },
        ],
      },
      {
        title: 'Main work',
        items: [
          { description: 'Cedar fence panel, 6 ft, supplied and installed', quantity: 6, unit: 'linear ft', unitPrice: 38, confidence: 'high', basis: '6 ft section stated in the audio' },
          { description: 'Gate with hardware, supplied and installed', quantity: 1, unit: 'each', unitPrice: 280, confidence: 'high', basis: 'one gate stated in the audio' },
        ],
      },
      {
        title: 'Finish and cleanup',
        items: [
          { description: 'Cleanup', quantity: 1, unit: 'job', unitPrice: 40, confidence: 'high', basis: 'standard' },
        ],
      },
    ],
    assumptions: ['Existing posts are sound and reused'],
    exclusions: ['Staining or sealing'],
    openQuestion: 'Should the new panel be stained to match the existing fence?',
  },
}
