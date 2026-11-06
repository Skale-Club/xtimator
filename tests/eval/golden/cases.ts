/**
 * tests/eval/golden/cases.ts
 *
 * SEED-057 Phase F: 18 synthetic golden cases (see types.ts).
 *
 *   8 x en   one per trade, built from the playbook's own worked example so the
 *            reference is exactly what the playbook teaches
 *   8 x pt   the same trades in Brazilian Portuguese, hand-written
 *   2 x en   deliberately under-specified (a missing dimension, an unclear scope):
 *            the right answer is assumptions and open questions, not confident numbers
 *
 * No real customer data: invented first names, no addresses, phones, emails or keys.
 */
import { PLAYBOOKS, type PlaybookId } from '@/lib/ai/playbooks'
import type { EstimateOutput } from '@/lib/ai/types'
import type { GoldenCase } from './types'

type Level = 'low' | 'medium' | 'high'

/** The reference answer of an English case: the playbook example, as the tool output. */
function fromExample(id: PlaybookId, name: string, summary: string): EstimateOutput {
  const ex = PLAYBOOKS[id].example
  return {
    suggested_project_name: name,
    suggested_client_name: null,
    detected_trade: id,
    summary,
    assumptions: ex.assumptions,
    exclusions: ex.exclusions,
    open_questions: [{ question: ex.openQuestion, impact: 'medium' }],
    scope_confidence: 'medium',
    sections: ex.sections.map((s) => ({
      title: s.title,
      items: s.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unitPrice,
        price_source: 'ai_estimate' as const,
        confidence: i.confidence,
        basis: i.basis,
      })),
    })),
  }
}

type Row = [description: string, quantity: number, unit: string, price: number, confidence: Level, basis: string]

/** A hand-written reference answer. */
function ref(
  name: string,
  trade: PlaybookId,
  summary: string,
  sections: Array<[title: string, rows: Row[]]>,
  notes: { assumptions?: string[]; exclusions?: string[]; questions?: string[]; confidence?: Level } = {},
): EstimateOutput {
  return {
    suggested_project_name: name,
    suggested_client_name: null,
    detected_trade: trade,
    summary,
    ...(notes.assumptions ? { assumptions: notes.assumptions } : {}),
    ...(notes.exclusions ? { exclusions: notes.exclusions } : {}),
    ...(notes.questions
      ? { open_questions: notes.questions.map((question) => ({ question, impact: 'medium' as const })) }
      : {}),
    scope_confidence: notes.confidence ?? 'medium',
    sections: sections.map(([title, rows]) => ({
      title,
      items: rows.map(([description, quantity, unit, unit_price, confidence, basis]) => ({
        description,
        quantity,
        unit,
        unit_price,
        price_source: 'ai_estimate' as const,
        confidence,
        basis,
      })),
    })),
  }
}

function subtotal(e: EstimateOutput): number {
  return e.sections.reduce((sum, s) => sum + s.items.reduce((t, i) => t + i.quantity * i.unit_price, 0), 0)
}

/** A generous band around the reference subtotal: what a competent estimate might plausibly total. */
function band(e: EstimateOutput, lo = 0.6, hi = 1.6): [number, number] {
  const t = subtotal(e)
  return [Math.round(t * lo), Math.round(t * hi)]
}

// ---------------------------------------------------------------------------
// English, one per trade (reference = the playbook example)
// ---------------------------------------------------------------------------

const cleaningEn = fromExample('cleaning', 'Move-Out Clean', 'Move-out deep clean of an empty 2 bedroom, 1 bath apartment, with the oven, refrigerator and interior windows included.')
const paintingEn = fromExample('painting', 'Bedroom Repaint', 'Repaint the walls, ceiling, baseboards and door of a 12 x 14 ft bedroom with 8 ft ceilings, including prep and cleanup.')
const landscapingEn = fromExample('landscaping', 'Front Bed Refresh', 'Clear the old front bed, plant six shrubs with drip irrigation, and finish with edging and three inches of mulch.')
const plumbingEn = fromExample('plumbing', 'Water Heater and Faucet', 'Replace a 40 gallon gas water heater and one leaking kitchen faucet, with permit, testing and haul-away.')
const electricalEn = fromExample('electrical', 'Kitchen Outlets', 'Add a dedicated 20 A kitchen circuit with two GFCI outlets and swap six bedroom outlets for tamper-resistant ones.')
const hvacEn = fromExample('hvac', 'AC Replacement', 'Replace a 3 ton split air conditioner (condenser and coil) on the existing furnace, with permit and startup.')
const roofingEn = fromExample('roofing', 'Full Re-Roof', 'Tear off and replace one layer of asphalt shingles on a 2,000 sq ft footprint at 6/12 pitch, with flashing and cleanup.')
const remodelEn = fromExample('remodel', 'Small Bath Remodel', 'Remodel a 5 x 8 ft bathroom: new tile floor, vanity and toilet, with demo and cleanup.')

// ---------------------------------------------------------------------------
// Portuguese, one per trade (hand-written)
// ---------------------------------------------------------------------------

const cleaningPt = ref('Limpeza Pós-Obra', 'cleaning', 'Limpeza pesada pós-obra de um apartamento de dois quartos e um banheiro, com cozinha completa e janelas.', [
  ['Áreas', [
    ['Limpeza completa da cozinha (armários, bancadas, pia)', 1, 'un', 150, 'high', 'uma cozinha citada no áudio'],
    ['Limpeza do banheiro (box, louças, azulejos)', 1, 'un', 80, 'high', 'um banheiro citado no áudio'],
    ['Limpeza dos quartos (piso, rodapés, armários)', 2, 'un', 60, 'high', 'dois quartos citados no áudio'],
    ['Limpeza da sala e do corredor', 1, 'un', 90, 'medium', 'tamanho estimado pela foto'],
  ]],
  ['Adicionais', [
    ['Limpeza dos vidros das janelas', 10, 'm2', 6, 'medium', 'cerca de dez metros quadrados de vidro citados no áudio'],
    ['Remoção de resíduos de tinta e cimento', 1, 'serviço', 120, 'low', 'quantidade de resíduo estimada pela foto'],
  ]],
], { assumptions: ['O apartamento estará vazio na data da limpeza'], exclusions: ['Lavagem de carpetes', 'Remoção de entulho'], questions: ['Há sujeira de tinta no piso que exija produto específico?'] })

const paintingPt = ref('Pintura da Sala', 'painting', 'Pintura das paredes e do teto de uma sala de 4 x 5 m com pé-direito de 2,7 m, incluindo preparação e limpeza.', [
  ['Preparação e proteção', [
    ['Preparação das paredes, massa corrida e proteção do piso', 1, 'serviço', 220, 'medium', 'preparação padrão para uma sala'],
  ]],
  ['Paredes', [
    ['Pintura das paredes, duas demãos com selador', 44, 'm2', 14, 'high', 'perímetro de 18 m x 2,7 m menos 4 m2 de aberturas'],
  ]],
  ['Teto', [
    ['Pintura do teto, duas demãos', 20, 'm2', 12, 'high', 'sala de 4 x 5 m citada no áudio'],
  ]],
  ['Acabamentos', [
    ['Pintura dos rodapés', 18, 'ml', 7, 'medium', 'perímetro da sala'],
  ]],
  ['Limpeza', [
    ['Limpeza final e descarte de materiais', 1, 'serviço', 70, 'high', 'padrão'],
  ]],
], { assumptions: ['As paredes estão em bom estado e precisam de pouco reparo'], exclusions: ['Mudança de móveis'], questions: ['Quem fornece a tinta?'] })

const landscapingPt = ref('Gramado do Quintal', 'landscaping', 'Preparo do solo e plantio de grama em placas em 80 m2 do quintal, com poda de duas árvores.', [
  ['Preparo do terreno', [
    ['Limpeza, nivelamento e adubação do solo', 80, 'm2', 5, 'medium', '80 m2 citados no áudio'],
  ]],
  ['Plantio', [
    ['Grama em placas fornecida e plantada', 88, 'm2', 14, 'high', '80 m2 mais 10% de perda'],
  ]],
  ['Poda', [
    ['Poda de árvores de médio porte', 2, 'un', 180, 'high', 'duas árvores citadas no áudio'],
  ]],
  ['Limpeza', [
    ['Descarte de restos de poda e entulho', 1, 'serviço', 150, 'medium', 'volume estimado'],
  ]],
], { assumptions: ['Há ponto de água disponível no local'], exclusions: ['Remoção de tocos'], questions: ['O quintal tem irrigação instalada?'] })

const plumbingPt = ref('Vaso e Torneira', 'plumbing', 'Troca do vaso sanitário e da torneira da pia do banheiro, com conserto do vazamento no registro.', [
  ['Louças e metais', [
    ['Troca do vaso sanitário (cliente fornece o vaso)', 1, 'un', 260, 'high', 'um vaso citado no áudio'],
    ['Troca da torneira da pia', 1, 'un', 120, 'high', 'uma torneira citada no áudio'],
  ]],
  ['Água e esgoto', [
    ['Conserto do vazamento no registro', 1, 'serviço', 150, 'medium', 'um registro citado no áudio'],
    ['Engate flexível, vedação e anel de borracha', 1, 'serviço', 55, 'medium', 'peças padrão'],
  ]],
  ['Teste e limpeza', [
    ['Teste de pressão, retirada do vaso antigo e limpeza', 1, 'serviço', 70, 'high', 'padrão para os dois itens'],
  ]],
], { assumptions: ['O registro pode ser consertado sem quebrar a parede'], exclusions: ['Reparo de azulejos'], questions: ['O registro precisa ser trocado?'] })

const electricalPt = ref('Tomadas e Pontos de Luz', 'electrical', 'Instalação de cinco tomadas novas e três pontos de luz na sala.', [
  ['Instalação elétrica', [
    ['Instalação de tomada 20 A', 5, 'un', 65, 'high', 'cinco tomadas citadas no áudio'],
    ['Instalação de ponto de luz com interruptor', 3, 'un', 90, 'high', 'três pontos citados no áudio'],
    ['Cabo e eletroduto', 40, 'ml', 4.5, 'medium', 'trajeto estimado de 35 m'],
  ]],
  ['Quadro de disjuntores', [
    ['Disjuntores novos para os circuitos', 2, 'un', 45, 'medium', 'dois circuitos novos'],
  ]],
  ['Acabamento e limpeza', [
    ['Fechamento de rasgos na parede e limpeza', 1, 'serviço', 140, 'medium', 'rasgos para o eletroduto'],
  ]],
], { assumptions: ['O quadro tem espaço para dois disjuntores'], exclusions: ['Pintura após o reparo'], questions: ['O quadro tem espaço livre?'] })

const hvacPt = ref('Ar Condicionado Split', 'hvac', 'Instalação de um ar condicionado split de 12 mil BTU no quarto, com 5 m de tubulação.', [
  ['Equipamento', [
    ['Ar condicionado split 12.000 BTU, fornecido e instalado', 1, 'un', 1900, 'high', 'um aparelho citado no áudio'],
    ['Tubulação de cobre e isolamento', 5, 'ml', 38, 'high', '5 metros citados no áudio'],
  ]],
  ['Elétrica e comando', [
    ['Circuito dedicado e disjuntor', 1, 'serviço', 210, 'medium', 'circuito exclusivo para o aparelho'],
  ]],
  ['Partida e testes', [
    ['Vácuo, carga de gás e teste de funcionamento', 1, 'serviço', 180, 'high', 'obrigatório em instalação nova'],
  ]],
  ['Limpeza', [
    ['Fixação do suporte, dreno e limpeza da obra', 1, 'serviço', 120, 'medium', 'padrão'],
  ]],
], { assumptions: ['A parede externa permite fixar o suporte'], exclusions: ['Reparo de alvenaria'], questions: ['Onde sai o dreno da condensadora?'] })

const roofingPt = ref('Telhado e Calha', 'roofing', 'Troca de 30 telhas quebradas e refação da calha de 12 metros.', [
  ['Retirada', [
    ['Retirada das telhas quebradas e descarte', 30, 'un', 4, 'high', '30 telhas citadas no áudio'],
    ['Retirada da calha antiga', 12, 'ml', 6, 'high', '12 metros citados no áudio'],
  ]],
  ['Cobertura', [
    ['Telha cerâmica nova, fornecida e assentada', 30, 'un', 9, 'high', '30 telhas citadas no áudio'],
    ['Vedação e rufos nas emendas', 12, 'ml', 11, 'medium', 'mesmo trecho da calha'],
  ]],
  ['Calha', [
    ['Calha nova em chapa galvanizada, instalada', 12, 'ml', 48, 'high', '12 metros citados no áudio'],
  ]],
  ['Limpeza', [
    ['Limpeza e remoção de entulho', 1, 'serviço', 180, 'medium', 'padrão'],
  ]],
], { assumptions: ['A estrutura de madeira do telhado está em bom estado'], exclusions: ['Troca de madeiramento'], questions: ['Há infiltração dentro do forro?'] })

const remodelPt = ref('Reforma do Banheiro', 'remodel', 'Reforma de um banheiro de 2 x 3 m: troca do piso e do revestimento das paredes, com demolição e limpeza.', [
  ['Demolição', [
    ['Demolição do piso e do revestimento antigo, com retirada de entulho', 1, 'serviço', 780, 'high', 'banheiro inteiro citado no áudio'],
  ]],
  ['Base', [
    ['Regularização do contrapiso e impermeabilização', 6, 'm2', 38, 'high', 'banheiro de 2 x 3 m citado no áudio'],
  ]],
  ['Acabamento', [
    ['Porcelanato no piso, fornecido e assentado', 6.6, 'm2', 70, 'high', '6 m2 mais 10% de perda'],
    ['Revestimento das paredes', 12, 'm2', 62, 'high', '12 m2 citados no áudio'],
    ['Rejunte e silicone', 1, 'serviço', 90, 'medium', 'padrão'],
  ]],
  ['Limpeza', [
    ['Limpeza final da obra', 1, 'serviço', 120, 'high', 'padrão'],
  ]],
], { assumptions: ['O encanamento existente será mantido'], exclusions: ['Troca de louças e metais'], questions: ['As louças e os metais também serão trocados?'] })

// ---------------------------------------------------------------------------
// Under-specified, English
// ---------------------------------------------------------------------------

const cleaningVague = ref('Deep Clean', 'cleaning', 'Deep clean of a house kitchen and bathrooms; the size of the house was not stated.', [
  ['Areas', [
    ['Kitchen deep clean (cabinets, counters, appliances outside)', 1, 'each', 150, 'low', 'one kitchen mentioned, size not stated'],
    ['Bathroom deep clean (tub, tile, toilet, vanity)', 2, 'each', 80, 'low', 'number of bathrooms not stated, two assumed'],
  ]],
  ['Add-ons', [
    ['Heavy-soil surcharge', 1, 'job', 60, 'low', 'condition not described'],
  ]],
], {
  assumptions: ['Assumes two bathrooms and a standard-size kitchen', 'Assumes normal soil level'],
  exclusions: ['Bedrooms and living areas', 'Interior windows'],
  questions: ['How many bathrooms are there?', 'Should bedrooms and living areas be cleaned too?', 'How big is the house?'],
  confidence: 'low',
})

const remodelVague = ref('Kitchen Update', 'remodel', 'Kitchen update whose scope is undecided: cabinets and floor were both mentioned as possibilities.', [
  ['Demo', [
    ['Demo and haul away of the existing items being replaced', 1, 'job', 900, 'low', 'scope undecided'],
  ]],
  ['Finish', [
    ['Cabinet refresh allowance', 1, 'job', 2500, 'low', 'cabinets mentioned as a maybe'],
    ['Flooring allowance', 1, 'job', 2200, 'low', 'floor mentioned as a maybe, size not stated'],
  ]],
  ['Cleanup', [
    ['Final cleanup', 1, 'job', 180, 'medium', 'standard'],
  ]],
], {
  assumptions: ['Assumes a standard 10 x 12 ft kitchen', 'Allowances are placeholders until the owner decides'],
  exclusions: ['Appliances', 'Countertops', 'Plumbing and electrical changes'],
  questions: ['Are the cabinets being replaced or only refreshed?', 'Is the floor being replaced, and how many square feet?', 'Are countertops part of the job?'],
  confidence: 'low',
})

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'cleaning-en-move-out',
    language: 'en',
    trade: 'cleaning',
    description: 'Move-out clean, 2 bed 1 bath, oven and fridge included.',
    inputs: {
      transcripts: [
        'Hi, this is for a move-out clean of a two bedroom, one bathroom apartment. The kitchen needs the full deep clean, and the tenant wants the inside of the oven and the inside of the fridge done too. There are around eight windows we should do on the inside. The place will be completely empty. No carpet shampooing, they said the carpets are fine.',
      ],
    },
    expect: {
      sections: ['areas', 'add'],
      concepts: [
        { label: 'kitchen', any: ['kitchen'] },
        { label: 'bathroom', any: ['bathroom'] },
        { label: 'bedroom', any: ['bedroom'] },
        { label: 'oven', any: ['oven'] },
        { label: 'refrigerator', any: ['refrigerator', 'fridge'] },
      ],
      quantities: [
        { label: 'bedrooms', any: ['bedroom'], value: 2, unit: 'each' },
        { label: 'windows', any: ['window'], value: 8, unit: 'each', tolerance: 0.3 },
      ],
      total: band(cleaningEn),
    },
    reference: cleaningEn,
  },
  {
    id: 'painting-en-bedroom',
    language: 'en',
    trade: 'painting',
    description: 'Bedroom repaint with stated room dimensions and ceiling height.',
    inputs: {
      transcripts: [
        "Okay, this is Dana's bedroom. The room is twelve by fourteen feet with eight foot ceilings. We're repainting the walls, the ceiling and the baseboards, and there's one door we need to do both sides. A couple of small nail holes to patch. She picked the colors already. Two coats on everything and we'll prime the walls first.",
      ],
    },
    expect: {
      sections: ['prep', 'walls', 'ceiling', 'trim', 'cleanup'],
      concepts: [
        { label: 'prep', any: ['patch', 'prep', 'mask', 'protect'] },
        { label: 'walls', any: ['wall'] },
        { label: 'ceiling', any: ['ceiling'] },
        { label: 'baseboard', any: ['baseboard'] },
        { label: 'door', any: ['door'] },
        { label: 'cleanup', any: ['cleanup', 'clean'] },
      ],
      quantities: [
        { label: 'wall area', any: ['wall'], value: 340, unit: 'sq ft', tolerance: 0.25 },
        { label: 'ceiling area', any: ['ceiling'], value: 168, unit: 'sq ft' },
        { label: 'baseboard length', any: ['baseboard'], value: 49, unit: 'linear ft', tolerance: 0.25 },
      ],
      total: band(paintingEn),
    },
    reference: paintingEn,
  },
  {
    id: 'landscaping-en-front-bed',
    language: 'en',
    trade: 'landscaping',
    description: 'Front bed refresh with six shrubs, mulch depth stated.',
    inputs: {
      transcripts: [
        "This is the front bed at Marcus's place. It's about thirty feet long and four feet deep. Everything in there is dead or overgrown, so pull it all out and regrade. We're putting in six new shrubs, three gallon, with a drip line, then three inches of mulch and fresh edging around the whole bed. Haul away all the green waste.",
      ],
    },
    expect: {
      sections: ['site prep', 'planting', 'irrigation', 'cleanup'],
      concepts: [
        { label: 'clearing', any: ['remove', 'clear', 'grade'] },
        { label: 'shrubs', any: ['shrub'] },
        { label: 'mulch', any: ['mulch'] },
        { label: 'edging', any: ['edging'] },
        { label: 'irrigation', any: ['drip', 'irrigation'] },
        { label: 'disposal', any: ['haul', 'debris', 'waste'] },
      ],
      quantities: [
        { label: 'shrubs', any: ['shrub'], value: 6, unit: 'each' },
        { label: 'mulch volume', any: ['mulch'], value: 1.5, unit: 'cu yd', tolerance: 0.3 },
      ],
      total: band(landscapingEn),
    },
    reference: landscapingEn,
  },
  {
    id: 'plumbing-en-water-heater',
    language: 'en',
    trade: 'plumbing',
    description: 'Gas water heater swap plus a kitchen faucet.',
    inputs: {
      transcripts: [
        'We need to replace the water heater, it is a forty gallon gas unit and it is leaking at the base. Also the kitchen faucet is dripping, the customer already bought a new one and just wants it installed. The heater is in the garage so access is easy. Take the old tank away and pull a permit.',
      ],
      photoDescriptions: ['Photo 1: Gas water heater in a garage, nameplate reads 40 gal, rust at the base and a small puddle.'],
    },
    expect: {
      sections: ['fixtures', 'water heater', 'testing'],
      concepts: [
        { label: 'water heater', any: ['water heater'] },
        { label: 'faucet', any: ['faucet'] },
        { label: 'permit', any: ['permit'] },
        { label: 'haul-away', any: ['haul', 'remove', 'dispos'] },
        { label: 'testing', any: ['test', 'cleanup'] },
      ],
      quantities: [
        { label: 'water heater', any: ['water heater'], value: 1, unit: 'each' },
        { label: 'faucet', any: ['faucet'], value: 1, unit: 'each' },
      ],
      total: band(plumbingEn),
    },
    reference: plumbingEn,
  },
  {
    id: 'electrical-en-outlets',
    language: 'en',
    trade: 'electrical',
    description: 'New kitchen circuit with GFCI outlets and six outlet swaps.',
    inputs: {
      transcripts: [
        'Job is in the kitchen and one bedroom. We are adding a dedicated twenty amp circuit for the kitchen counter with two GFCI outlets. The panel is in the basement, about forty feet away, and there is an unfinished ceiling along the way. In the bedroom we are swapping six outlets for tamper-resistant ones. It needs a permit and we will have to patch one section of wall.',
      ],
    },
    expect: {
      sections: ['panel', 'rough', 'devices', 'permit', 'cleanup'],
      concepts: [
        { label: 'breaker or circuit', any: ['breaker', 'circuit'] },
        { label: 'GFCI outlet', any: ['gfci'] },
        { label: 'tamper-resistant outlets', any: ['tamper'] },
        { label: 'cable', any: ['cable', 'wire'] },
        { label: 'permit', any: ['permit'] },
        { label: 'patching', any: ['patch', 'cleanup'] },
      ],
      quantities: [
        { label: 'GFCI outlets', any: ['gfci'], value: 2, unit: 'each' },
        { label: 'tamper-resistant outlets', any: ['tamper'], value: 6, unit: 'each' },
      ],
      total: band(electricalEn),
    },
    reference: electricalEn,
  },
  {
    id: 'hvac-en-ac-replacement',
    language: 'en',
    trade: 'hvac',
    description: 'Three ton split AC replacement on an existing furnace.',
    inputs: {
      transcripts: [
        'The air conditioner is dead. The data plate says three ton, and the furnace upstairs is fine so we keep it. We are replacing the outdoor condenser and the evaporator coil. The two units are about twenty feet apart so figure a twenty-five foot line set. New pad outside, new disconnect, reuse the thermostat. Haul away the old equipment and pull a permit.',
      ],
    },
    expect: {
      sections: ['equipment', 'electrical', 'startup', 'cleanup'],
      concepts: [
        { label: 'condenser', any: ['condenser'] },
        { label: 'coil', any: ['coil'] },
        { label: 'line set', any: ['line set'] },
        { label: 'startup or charge', any: ['startup', 'charge', 'commission'] },
        { label: 'permit', any: ['permit'] },
        { label: 'haul-away', any: ['haul', 'remove'] },
      ],
      quantities: [
        { label: 'condenser', any: ['condenser'], value: 1, unit: 'each' },
        { label: 'line set length', any: ['line set'], value: 25, unit: 'linear ft', tolerance: 0.25 },
      ],
      total: band(hvacEn),
    },
    reference: hvacEn,
  },
  {
    id: 'roofing-en-re-roof',
    language: 'en',
    trade: 'roofing',
    description: 'Full re-roof with footprint and pitch stated.',
    inputs: {
      transcripts: [
        'Full re-roof on the main house. The footprint is about two thousand square feet and the pitch is six in twelve, so call it twenty-two hundred feet of roof surface. One layer of asphalt shingles to tear off. We saw three pipe vents and one valley. Allow a few sheets of decking. Architectural shingles, new underlayment, drip edge on all the eaves and rakes, and pull a permit.',
      ],
    },
    expect: {
      sections: ['tear', 'underlayment', 'shingle', 'flashing', 'cleanup'],
      concepts: [
        { label: 'tear-off', any: ['tear off', 'tear-off', 'remove'] },
        { label: 'underlayment', any: ['underlayment'] },
        { label: 'shingles', any: ['shingle'] },
        { label: 'flashing or boots', any: ['flashing', 'boot', 'valley'] },
        { label: 'drip edge', any: ['drip edge'] },
        { label: 'permit or cleanup', any: ['permit', 'cleanup'] },
      ],
      quantities: [{ label: 'roof area', any: ['tear off', 'tear-off', 'underlayment'], value: 2240, unit: 'sq ft' }],
      total: band(roofingEn),
    },
    reference: roofingEn,
  },
  {
    id: 'remodel-en-bathroom',
    language: 'en',
    trade: 'remodel',
    description: 'Small bathroom remodel with stated dimensions.',
    inputs: {
      transcripts: [
        'Small bathroom remodel, the room is five by eight feet. Rip out the old floor, the vanity and the toilet and haul everything away. The subfloor has a soft spot near the tub so plan on some repair. Then new porcelain tile on the floor, a new vanity with a faucet, a new toilet and baseboard trim, painted. Cleanup at the end.',
      ],
    },
    expect: {
      sections: ['demo', 'rough', 'finish', 'cleanup'],
      concepts: [
        { label: 'demo and haul-away', any: ['demo', 'haul'] },
        { label: 'subfloor', any: ['subfloor'] },
        { label: 'tile', any: ['tile'] },
        { label: 'vanity', any: ['vanity'] },
        { label: 'toilet', any: ['toilet'] },
        { label: 'baseboard or trim', any: ['baseboard', 'trim'] },
        { label: 'cleanup', any: ['cleanup'] },
      ],
      quantities: [
        { label: 'floor tile', any: ['tile'], value: 44, unit: 'sq ft' },
        { label: 'toilet', any: ['toilet'], value: 1 },
      ],
      total: band(remodelEn),
    },
    reference: remodelEn,
  },
  // ----- Portuguese -----
  {
    id: 'cleaning-pt-pos-obra',
    language: 'pt',
    trade: 'cleaning',
    description: 'Limpeza pos-obra de apartamento de dois quartos.',
    inputs: {
      transcripts: [
        'Oi, é uma limpeza pós-obra num apartamento de dois quartos e um banheiro. A cozinha precisa de limpeza completa e tem uns dez metros quadrados de vidro nas janelas. Tem resíduo de tinta e de cimento no piso da sala. O apartamento vai estar vazio. Não precisa lavar carpete.',
      ],
    },
    expect: {
      sections: ['areas', 'adicion'],
      concepts: [
        { label: 'cozinha', any: ['cozinha'] },
        { label: 'banheiro', any: ['banheiro'] },
        { label: 'quartos', any: ['quarto'] },
        { label: 'janelas', any: ['janela', 'vidro'] },
      ],
      quantities: [
        { label: 'quartos', any: ['quarto'], value: 2 },
        { label: 'vidros', any: ['janela', 'vidro'], value: 10, tolerance: 0.3 },
      ],
      total: band(cleaningPt),
    },
    reference: cleaningPt,
  },
  {
    id: 'painting-pt-sala',
    language: 'pt',
    trade: 'painting',
    description: 'Pintura de sala com medidas informadas.',
    inputs: {
      transcripts: [
        'Vamos pintar a sala da dona Marta. A sala tem quatro por cinco metros e o pé-direito é dois e setenta. É para pintar as paredes e o teto, duas demãos, com selador antes. Tem uma porta e uma janela. Precisa passar massa em alguns furos e proteger o piso. No fim, limpar tudo.',
      ],
    },
    expect: {
      sections: ['prepar', 'parede', 'teto', 'limpeza'],
      concepts: [
        { label: 'preparação', any: ['prepara', 'protec', 'massa'] },
        { label: 'paredes', any: ['parede'] },
        { label: 'teto', any: ['teto'] },
        { label: 'limpeza', any: ['limpeza'] },
      ],
      quantities: [
        { label: 'paredes', any: ['parede'], value: 44, tolerance: 0.25 },
        { label: 'teto', any: ['teto'], value: 20 },
      ],
      total: band(paintingPt),
    },
    reference: paintingPt,
  },
  {
    id: 'landscaping-pt-gramado',
    language: 'pt',
    trade: 'landscaping',
    description: 'Gramado de oitenta metros quadrados e poda de duas arvores.',
    inputs: {
      transcripts: [
        'O quintal do seu Paulo tem uns oitenta metros quadrados de terra batida. A ideia é preparar o solo, colocar grama em placas e adubar. Também tem duas árvores médias para podar e tem que levar embora os galhos.',
      ],
    },
    expect: {
      sections: ['preparo', 'plantio', 'poda', 'limpeza'],
      concepts: [
        { label: 'preparo do solo', any: ['preparo', 'nivelamento', 'solo'] },
        { label: 'grama', any: ['grama'] },
        { label: 'poda', any: ['poda'] },
        { label: 'descarte', any: ['descarte', 'resto', 'entulho'] },
      ],
      quantities: [
        { label: 'grama', any: ['grama'], value: 88, tolerance: 0.2 },
        { label: 'árvores', any: ['arvore', 'árvore', 'poda'], value: 2 },
      ],
      total: band(landscapingPt),
    },
    reference: landscapingPt,
  },
  {
    id: 'plumbing-pt-vaso-torneira',
    language: 'pt',
    trade: 'plumbing',
    description: 'Troca de vaso sanitario e torneira, vazamento no registro.',
    inputs: {
      transcripts: [
        'Preciso trocar o vaso sanitário do banheiro, o cliente já comprou o vaso, e trocar a torneira da pia. Tem também um vazamento no registro da parede. Levar o vaso velho embora e fazer o teste no final.',
      ],
    },
    expect: {
      sections: ['loucas', 'agua', 'teste'],
      concepts: [
        { label: 'vaso', any: ['vaso'] },
        { label: 'torneira', any: ['torneira'] },
        { label: 'registro', any: ['registro', 'vazamento'] },
        { label: 'teste', any: ['teste'] },
      ],
      quantities: [
        { label: 'vaso', any: ['vaso'], value: 1 },
        { label: 'torneira', any: ['torneira'], value: 1 },
      ],
      total: band(plumbingPt),
    },
    reference: plumbingPt,
  },
  {
    id: 'electrical-pt-tomadas',
    language: 'pt',
    trade: 'electrical',
    description: 'Cinco tomadas e tres pontos de luz.',
    inputs: {
      transcripts: [
        'Na sala vamos instalar cinco tomadas novas e três pontos de luz com interruptor. O quadro fica no corredor, uns trinta e cinco metros de fio até a sala. Precisa de dois disjuntores novos. Depois tem que fechar os rasgos na parede e limpar.',
      ],
    },
    expect: {
      sections: ['instalac', 'quadro', 'acabamento'],
      concepts: [
        { label: 'tomadas', any: ['tomada'] },
        { label: 'pontos de luz', any: ['ponto de luz', 'luz'] },
        { label: 'cabo', any: ['cabo', 'eletroduto'] },
        { label: 'disjuntores', any: ['disjuntor'] },
      ],
      quantities: [
        { label: 'tomadas', any: ['tomada'], value: 5 },
        { label: 'pontos de luz', any: ['ponto de luz', 'luz'], value: 3 },
      ],
      total: band(electricalPt),
    },
    reference: electricalPt,
  },
  {
    id: 'hvac-pt-split',
    language: 'pt',
    trade: 'hvac',
    description: 'Ar condicionado split de doze mil BTU.',
    inputs: {
      transcripts: [
        'Instalar um ar condicionado split de doze mil BTU no quarto do casal. A condensadora vai na parede externa, uns cinco metros de tubulação de cobre. Precisa de um circuito exclusivo no quadro, fazer o vácuo, carregar o gás e testar. O dreno desce pela parede.',
      ],
    },
    expect: {
      sections: ['equipamento', 'eletric', 'partida', 'limpeza'],
      concepts: [
        { label: 'aparelho', any: ['ar condicionado', 'split'] },
        { label: 'tubulação', any: ['tubulacao', 'tubulação', 'cobre'] },
        { label: 'circuito', any: ['circuito', 'disjuntor'] },
        { label: 'teste ou gás', any: ['vacuo', 'vácuo', 'gás', 'gas', 'teste'] },
      ],
      quantities: [
        { label: 'aparelho', any: ['split', 'ar condicionado'], value: 1 },
        { label: 'tubulação', any: ['tubulacao', 'tubulação', 'cobre'], value: 5, tolerance: 0.25 },
      ],
      total: band(hvacPt),
    },
    reference: hvacPt,
  },
  {
    id: 'roofing-pt-telhas-calha',
    language: 'pt',
    trade: 'roofing',
    description: 'Troca de telhas quebradas e calha nova.',
    inputs: {
      transcripts: [
        'A casa tem umas trinta telhas quebradas na parte da frente e a calha de doze metros está toda enferrujada. Vamos tirar as telhas quebradas, assentar telha nova, trocar a calha por uma de chapa galvanizada e vedar as emendas. No fim, tirar o entulho.',
      ],
    },
    expect: {
      sections: ['retirada', 'cobertura', 'calha', 'limpeza'],
      concepts: [
        { label: 'retirada', any: ['retirada'] },
        { label: 'telha nova', any: ['telha'] },
        { label: 'calha', any: ['calha'] },
        { label: 'limpeza', any: ['limpeza', 'entulho'] },
      ],
      quantities: [
        { label: 'telhas', any: ['telha'], value: 30 },
        { label: 'calha', any: ['calha'], value: 12 },
      ],
      total: band(roofingPt),
    },
    reference: roofingPt,
  },
  {
    id: 'remodel-pt-banheiro',
    language: 'pt',
    trade: 'remodel',
    description: 'Reforma de banheiro de dois por tres metros.',
    inputs: {
      transcripts: [
        'Reforma do banheiro, ele tem dois por três metros. Quebrar o piso e o revestimento velhos e tirar o entulho. Depois regularizar o contrapiso, impermeabilizar, assentar porcelanato no piso e revestir doze metros quadrados de parede. Rejunte no final e limpeza da obra.',
      ],
    },
    expect: {
      sections: ['demolic', 'base', 'acabamento', 'limpeza'],
      concepts: [
        { label: 'demolição', any: ['demolic', 'demolição'] },
        { label: 'impermeabilização', any: ['impermeabiliza', 'contrapiso'] },
        { label: 'porcelanato', any: ['porcelanato', 'piso'] },
        { label: 'revestimento', any: ['revestimento'] },
        { label: 'limpeza', any: ['limpeza'] },
      ],
      quantities: [
        { label: 'piso', any: ['porcelanato'], value: 6.6, tolerance: 0.2 },
        { label: 'revestimento', any: ['revestimento'], value: 12 },
      ],
      total: band(remodelPt),
    },
    reference: remodelPt,
  },
  // ----- Under-specified -----
  {
    id: 'cleaning-en-missing-size',
    language: 'en',
    trade: 'cleaning',
    description: 'Deep clean with no size given: the right answer is assumptions and questions.',
    ambiguity: 'missing_dimension',
    inputs: {
      transcripts: [
        'Hey, I got a call about a deep clean at a house. They want the kitchen and the bathrooms done really well. I did not get how big the house is or how many bathrooms. They said it has not been cleaned in a long time.',
      ],
    },
    expect: {
      sections: ['areas'],
      concepts: [
        { label: 'kitchen', any: ['kitchen'] },
        { label: 'bathroom', any: ['bathroom'] },
      ],
      total: [150, 1500],
      needsAssumptions: true,
      needsOpenQuestions: true,
    },
    reference: cleaningVague,
  },
  {
    id: 'remodel-en-unclear-scope',
    language: 'en',
    trade: 'remodel',
    description: 'Kitchen update with an undecided scope.',
    ambiguity: 'unclear_scope',
    inputs: {
      transcripts: [
        'The owners want to update the kitchen but have not decided what. Maybe new cabinets, maybe just refresh them, maybe the floor too. They want a rough number so they can decide. I did not measure anything yet.',
      ],
    },
    expect: {
      sections: ['demo', 'finish'],
      concepts: [
        { label: 'cabinets', any: ['cabinet'] },
        { label: 'flooring', any: ['floor'] },
      ],
      total: [1500, 14000],
      needsAssumptions: true,
      needsOpenQuestions: true,
    },
    reference: remodelVague,
  },
]
