/**
 * tests/eval/fixtures/cases.ts
 *
 * EVAL-01 — the 6 representative golden cases. SYNTHETIC data only (no real
 * PII/keys → gitleaks-safe). Covers the three modalities (audio transcript,
 * photo description, text) + a mixed case + a deliberately-vague case (exercises
 * the vagueness gate + auto-refine cap=1) + a schema-drift "metric teeth" case
 * (asserts estimateOutputSchema.safeParse rejects malformed output).
 *
 * Cases 1-5 run through the FULL real graph (provider mocked, supabase mocked).
 * Case 6 (schema-drift-guard) is a metrics-unit assertion only — it proves the
 * schema metric fails on bad output; it is NOT driven through the engine.
 *
 * providerResponse for cases 1-5 is a VALID create_estimate tool JSON shaped to
 * estimateOutputSchema (suggested_project_name, summary, sections[{title,
 * items[{description, quantity, unit_price, price_source}]}]).
 *
 * Helper module (NOT a *.test.ts) — never collected as a suite.
 */
import type { EvalCase } from './types'

export const CASES: EvalCase[] = [
  {
    id: 'audio-deck-rebuild',
    modality: 'audio',
    description:
      'Audio walkthrough: rebuild a 200 sqft pressure-treated deck. One transcript, ~6 items.',
    inputs: {
      transcripts: [
        'Okay so this is the back deck, about two hundred square feet, the old ' +
          'boards are rotted out. We need to tear out the old decking, replace the ' +
          'joists where they are soft, lay new pressure-treated boards, new railings, ' +
          'and seal the whole thing. Pressure treated lumber throughout.',
      ],
    },
    providerResponse: {
      suggested_project_name: 'Back Deck Rebuild',
      summary: 'Tear-out and rebuild of a 200 sqft pressure-treated deck.',
      sections: [
        {
          title: 'Demolition & Prep',
          items: [
            {
              description: 'Tear out and haul away old decking',
              quantity: 200,
              unit: 'sqft',
              unit_price: 3.5,
              price_source: 'ai_estimate',
            },
            {
              description: 'Replace soft/rotted joists',
              quantity: 8,
              unit: 'each',
              unit_price: 45,
              price_source: 'ai_estimate',
            },
          ],
        },
        {
          title: 'Build & Finish',
          items: [
            {
              description: 'Pressure-treated decking boards installed',
              quantity: 200,
              unit: 'sqft',
              unit_price: 12,
              price_source: 'ai_estimate',
            },
            {
              description: 'New pressure-treated railing',
              quantity: 60,
              unit: 'linear ft',
              unit_price: 22,
              price_source: 'ai_estimate',
            },
            {
              description: 'Stairs rebuild',
              quantity: 1,
              unit: 'each',
              unit_price: 650,
              price_source: 'ai_estimate',
            },
            {
              description: 'Seal and waterproof deck',
              quantity: 200,
              unit: 'sqft',
              unit_price: 1.75,
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    },
    expected: {
      schemaValid: true,
      minLineItems: 4,
      positiveTotal: true,
      isVague: false,
    },
  },
  {
    id: 'photo-roof-repair',
    modality: 'photo',
    description:
      'Photo analysis: missing shingles + flashing damage on a residential roof. ~4 items.',
    inputs: {
      photoDescriptions: [
        'Asphalt-shingle roof with a section of missing shingles near the ridge, ' +
          'visible water staining on the underlayment, and damaged flashing around ' +
          'the chimney. Approximately a 150 sqft affected area.',
      ],
    },
    providerResponse: {
      suggested_project_name: 'Roof Shingle & Flashing Repair',
      summary: 'Repair of missing shingles and damaged chimney flashing.',
      sections: [
        {
          title: 'Roof Repair',
          items: [
            {
              description: 'Remove damaged shingles and underlayment',
              quantity: 150,
              unit: 'sqft',
              unit_price: 2.25,
              price_source: 'ai_estimate',
            },
            {
              description: 'Install new architectural shingles',
              quantity: 150,
              unit: 'sqft',
              unit_price: 5.5,
              price_source: 'ai_estimate',
            },
            {
              description: 'Replace chimney flashing',
              quantity: 1,
              unit: 'each',
              unit_price: 425,
              price_source: 'ai_estimate',
            },
            {
              description: 'Replace water-stained underlayment',
              quantity: 150,
              unit: 'sqft',
              unit_price: 1.1,
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    },
    expected: {
      schemaValid: true,
      minLineItems: 3,
      positiveTotal: true,
      isVague: false,
    },
  },
  {
    id: 'text-fence-paint',
    modality: 'text',
    description: 'Text prompt: paint an 80ft cedar fence, two coats. ~3 items.',
    inputs: {
      texts: ['Paint 80 feet of cedar fence, two coats, both sides. Include prep and primer.'],
    },
    providerResponse: {
      suggested_project_name: 'Cedar Fence Painting',
      summary: 'Two-coat paint of an 80ft cedar fence, both sides.',
      sections: [
        {
          title: 'Fence Painting',
          items: [
            {
              description: 'Pressure-wash and prep fence',
              quantity: 80,
              unit: 'linear ft',
              unit_price: 1.5,
              price_source: 'ai_estimate',
            },
            {
              description: 'Primer coat both sides',
              quantity: 160,
              unit: 'linear ft',
              unit_price: 1.25,
              price_source: 'ai_estimate',
            },
            {
              description: 'Two finish coats both sides',
              quantity: 160,
              unit: 'linear ft',
              unit_price: 2.75,
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    },
    expected: {
      schemaValid: true,
      minLineItems: 2,
      positiveTotal: true,
      isVague: false,
    },
  },
  {
    id: 'mixed-kitchen-reno',
    modality: 'mixed',
    description:
      'Mixed: transcript + photo description + text for a full kitchen remodel. 3 sections, ~10 items.',
    inputs: {
      transcripts: [
        'This is the kitchen, we want a full remodel — new cabinets, countertops, ' +
          'backsplash, sink and faucet, and all new appliances. Repaint the walls too.',
      ],
      photoDescriptions: [
        'Dated kitchen with oak cabinets, laminate countertops, and a single-basin ' +
          'sink. Roughly 180 sqft of floor area and 30 linear ft of cabinet run.',
      ],
      texts: ['Budget is flexible but they want mid-range finishes.'],
    },
    providerResponse: {
      suggested_project_name: 'Full Kitchen Remodel',
      summary: 'Mid-range full kitchen remodel: cabinets, counters, appliances, paint.',
      sections: [
        {
          title: 'Demolition',
          items: [
            {
              description: 'Demo old cabinets and countertops',
              quantity: 1,
              unit: 'job',
              unit_price: 1200,
              price_source: 'ai_estimate',
            },
            {
              description: 'Haul away debris',
              quantity: 1,
              unit: 'job',
              unit_price: 350,
              price_source: 'ai_estimate',
            },
          ],
        },
        {
          title: 'Cabinets & Counters',
          items: [
            {
              description: 'Mid-range shaker cabinets installed',
              quantity: 30,
              unit: 'linear ft',
              unit_price: 280,
              price_source: 'ai_estimate',
            },
            {
              description: 'Quartz countertops',
              quantity: 45,
              unit: 'sqft',
              unit_price: 65,
              price_source: 'ai_estimate',
            },
            {
              description: 'Tile backsplash',
              quantity: 35,
              unit: 'sqft',
              unit_price: 22,
              price_source: 'ai_estimate',
            },
            {
              description: 'Undermount sink and faucet',
              quantity: 1,
              unit: 'each',
              unit_price: 540,
              price_source: 'ai_estimate',
            },
          ],
        },
        {
          title: 'Appliances & Finish',
          items: [
            {
              description: 'Mid-range appliance package',
              quantity: 1,
              unit: 'set',
              unit_price: 4800,
              price_source: 'ai_estimate',
            },
            {
              description: 'New flooring',
              quantity: 180,
              unit: 'sqft',
              unit_price: 7.5,
              price_source: 'ai_estimate',
            },
            {
              description: 'Paint walls and ceiling',
              quantity: 180,
              unit: 'sqft',
              unit_price: 2.25,
              price_source: 'ai_estimate',
            },
            {
              description: 'Electrical and plumbing hookups',
              quantity: 1,
              unit: 'job',
              unit_price: 950,
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    },
    expected: {
      schemaValid: true,
      minLineItems: 6,
      positiveTotal: true,
      isVague: false,
    },
  },
  {
    id: 'vague-do-some-work',
    modality: 'text',
    description:
      'Deliberately-vague text: provider returns a thin/empty estimate → exercises the ' +
      'vagueness gate + auto-refine cap=1. Persisted estimate is $0 with no items.',
    inputs: {
      texts: ['do some work when you can'],
    },
    providerResponse: {
      suggested_project_name: 'Unspecified Work',
      summary: 'Not enough detail to produce a priced estimate.',
      sections: [],
    },
    expected: {
      schemaValid: true,
      minLineItems: 0,
      positiveTotal: false,
      isVague: true,
    },
  },
  {
    id: 'schema-drift-guard',
    modality: 'text',
    description:
      'Metric-teeth case: provider response has a malformed field (unit_price is the ' +
      'string "ten"). estimateOutputSchema.safeParse MUST reject it. This is a ' +
      'metrics-unit assertion, NOT a full-graph run.',
    inputs: {
      texts: ['install a ceiling fan'],
    },
    providerResponse: {
      suggested_project_name: 'Ceiling Fan Install',
      summary: 'Install a ceiling fan.',
      sections: [
        {
          title: 'Electrical',
          items: [
            {
              description: 'Install ceiling fan',
              quantity: 1,
              unit: 'each',
              // Malformed on purpose: a string where a number is required.
              unit_price: 'ten',
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    },
    expected: {
      schemaValid: false,
      minLineItems: 0,
      positiveTotal: false,
      isVague: true,
    },
  },
]
