export type IndustryFaq = { question: string; answer: string }

export type SeoIndustry = {
  slug: string
  name: string
  eyebrow: string
  title: string
  description: string
  intro: string
  painPoints: string[]
  outcomes: string[]
  projectExamples: string[]
  faqs: IndustryFaq[]
}

export const SEO_INDUSTRIES: readonly SeoIndustry[] = [
  {
    slug: 'general-contractors',
    name: 'General Contractors',
    eyebrow: 'Built for moving job sites',
    title: 'AI Estimating Software for General Contractors',
    description: 'Turn walkthrough notes and job-site photos into detailed, professional construction estimates before the next bid gets cold.',
    intro: 'General contracting estimates pull together changing scope, several trades, material assumptions, and client expectations. Xtimator captures the walkthrough once, organizes it into a reviewable scope, and gives you a professional starting point while the details are still fresh.',
    painPoints: ['Rewriting field notes at night', 'Missing small scope items across trades', 'Slow follow-up while competitors send bids'],
    outcomes: ['Structured labor and material line items', 'Branded proposals ready to review and send', 'A repeatable estimate format across the team'],
    projectExamples: ['Kitchen and bathroom remodels', 'Tenant improvements', 'Residential additions', 'Repair and punch-list work'],
    faqs: [
      { question: 'Can Xtimator create an estimate from a site walkthrough?', answer: 'Yes. Record the walkthrough, add photos or written details, and Xtimator turns that field context into a structured estimate draft for your review.' },
      { question: 'Does the contractor keep control of pricing?', answer: 'Yes. Your price book and reviewed line items remain the authority. AI accelerates the draft; you approve the scope and numbers before sending.' },
      { question: 'Can I send a professional proposal from the job site?', answer: 'Yes. After review, send a branded PDF or shareable estimate link without rebuilding the document in another tool.' },
    ],
  },
  {
    slug: 'landscaping',
    name: 'Landscaping',
    eyebrow: 'From curbside notes to clear scope',
    title: 'Fast Landscaping Estimates from Voice and Photos',
    description: 'Build landscaping estimates from property walkthroughs, photos, quantities, and service details while you are still on site.',
    intro: 'Landscape work mixes visible conditions, measurements, materials, equipment, and recurring service expectations. Xtimator helps capture those details in the yard, then organizes them into a quote that clients can understand without a second round of data entry.',
    painPoints: ['Forgetting plant, disposal, or access details', 'Mixing one-time projects with recurring work', 'Waiting until evening to assemble the quote'],
    outcomes: ['Clear separation of labor, materials, and recurring services', 'Photo-informed scope that reflects site conditions', 'Faster client follow-up from the driveway'],
    projectExamples: ['Lawn renovation', 'Planting and bed installation', 'Hardscaping', 'Irrigation repair', 'Seasonal maintenance'],
    faqs: [
      { question: 'Can I describe a landscaping job by voice?', answer: 'Yes. Walk the property and describe access, quantities, materials, cleanup, and client requests while Xtimator captures the details.' },
      { question: 'Can photos be included in the estimating workflow?', answer: 'Yes. Site photos can provide useful visual context for the generated scope and can be attached to the final estimate when appropriate.' },
      { question: 'Does it work for recurring maintenance?', answer: 'Yes. You can describe frequency and included services, then review the resulting line items and terms before sending.' },
    ],
  },
  {
    slug: 'plumbing',
    name: 'Plumbing',
    eyebrow: 'Quote the repair while the diagnosis is fresh',
    title: 'AI Estimate Builder for Plumbing Contractors',
    description: 'Convert plumbing diagnostics, fixture details, access conditions, and photos into a polished estimate in minutes.',
    intro: 'Plumbing quotes often depend on what you found behind the wall, the condition of existing equipment, and which repair options the customer accepts. Xtimator turns your spoken diagnosis and photos into a clear draft with room for materials, labor, exclusions, and next steps.',
    painPoints: ['Losing diagnostic detail between calls', 'Explaining repair options inconsistently', 'Typing model numbers and access notes twice'],
    outcomes: ['Readable scopes for repair or replacement options', 'Consistent descriptions across technicians', 'Professional estimates delivered sooner'],
    projectExamples: ['Water heater replacement', 'Fixture installation', 'Repiping', 'Drain and sewer repair', 'Leak remediation'],
    faqs: [
      { question: 'Can technicians create estimates without typing?', answer: 'Yes. They can record the diagnosis and scope, add photos, and review the structured draft before it is sent.' },
      { question: 'Can I include exclusions and assumptions?', answer: 'Yes. Terms, assumptions, and scope notes remain editable so the final estimate reflects the actual conditions and company policy.' },
      { question: 'Can Xtimator use my company pricing?', answer: 'Yes. A company price book can anchor known services so your reviewed pricing takes priority over generated suggestions.' },
    ],
  },
  {
    slug: 'electrical',
    name: 'Electrical',
    eyebrow: 'Capture panel, access, and code context',
    title: 'Electrical Estimating Software for Field Contractors',
    description: 'Create organized electrical estimates from walkthrough audio, panel photos, device counts, and installation notes.',
    intro: 'Electrical scope changes quickly with panel capacity, access, device counts, finishes, and existing conditions. Xtimator keeps those observations together and turns them into a structured estimate draft that is easier for both the electrician and customer to review.',
    painPoints: ['Device counts scattered across notes and photos', 'Unclear allowances for access or repair work', 'Delayed estimates after a full service day'],
    outcomes: ['Itemized scope organized by work area', 'Consistent language for upgrades and installations', 'Faster review without sacrificing professional detail'],
    projectExamples: ['Panel upgrades', 'EV charger installation', 'Lighting retrofits', 'Rewiring', 'Troubleshooting and repair'],
    faqs: [
      { question: 'Can photos help document electrical conditions?', answer: 'Yes. Panel, device, and access photos add context to the estimate draft and help preserve what was observed on site.' },
      { question: 'Does AI replace the electrician’s judgment?', answer: 'No. Xtimator accelerates documentation and drafting. A qualified contractor reviews scope, code requirements, quantities, and pricing.' },
      { question: 'Can estimates be branded?', answer: 'Yes. Your company information and brand can appear on the PDF and public estimate experience.' },
    ],
  },
  {
    slug: 'hvac',
    name: 'HVAC',
    eyebrow: 'Turn equipment findings into options',
    title: 'AI-Powered HVAC Estimate and Proposal Software',
    description: 'Draft HVAC repair, replacement, and installation estimates from equipment notes, photos, and customer priorities.',
    intro: 'HVAC proposals need to connect equipment condition, comfort goals, capacity assumptions, accessories, and installation constraints. Xtimator captures the technician’s findings and shapes them into a proposal draft that can be reviewed while the customer conversation is current.',
    painPoints: ['Equipment details copied between systems', 'Repair and replacement options described unevenly', 'Proposal turnaround delayed by office entry'],
    outcomes: ['Clear option-based scopes', 'Consistent equipment and installation descriptions', 'Quicker delivery of branded proposals'],
    projectExamples: ['System replacement', 'Mini-split installation', 'Ductwork modification', 'Indoor air quality upgrades', 'Repair and maintenance'],
    faqs: [
      { question: 'Can I create multiple HVAC options?', answer: 'You can create and refine estimate versions for different scopes or equipment approaches, then send the option that fits the customer conversation.' },
      { question: 'Can Xtimator read equipment photos?', answer: 'Photos can provide useful context such as visible equipment and site conditions, but the contractor must verify model, capacity, compatibility, and code requirements.' },
      { question: 'Is the final total calculated by AI?', answer: 'The application calculates totals server-side from the reviewed line items, taxes, discounts, markup, and deposit settings.' },
    ],
  },
  {
    slug: 'cleaning-services',
    name: 'Cleaning Services',
    eyebrow: 'Scope every room, surface, and add-on',
    title: 'Cleaning Service Estimate Software Built for Walkthroughs',
    description: 'Turn residential and commercial cleaning walkthroughs into clear estimates with areas, conditions, add-ons, and frequency.',
    intro: 'Cleaning quotes depend on condition, access, room or surface count, special treatments, and service frequency. Xtimator lets you narrate what you see, attach photos, and produce a consistent draft without trying to remember every add-on after the walkthrough.',
    painPoints: ['Underquoting condition-heavy work', 'Missing add-ons such as appliances or stain treatment', 'Inconsistent scopes between estimators'],
    outcomes: ['Room- and service-based line items', 'Clear one-time versus recurring scope', 'Consistent branded quotes across the team'],
    projectExamples: ['Deep cleaning', 'Move-in and move-out', 'Post-construction cleanup', 'Carpet and upholstery cleaning', 'Recurring commercial service'],
    faqs: [
      { question: 'Can Xtimator handle condition-based cleaning quotes?', answer: 'Yes. Describe condition, size, special surfaces, access, and add-ons so the draft reflects the actual walkthrough.' },
      { question: 'Can I quote carpet and upholstery work?', answer: 'Yes. Include material, dimensions or seat counts, stain treatment, deodorizing, and other service details for review.' },
      { question: 'Can recurring frequency appear in the proposal?', answer: 'Yes. Add frequency and included tasks to the scope and terms so the client understands what each visit covers.' },
    ],
  },
  {
    slug: 'painting-contractors',
    name: 'Painting Contractors',
    eyebrow: 'Keep prep, coats, and finishes visible',
    title: 'Painting Estimate Software from Walkthrough to Proposal',
    description: 'Capture rooms, surfaces, prep work, finishes, and access details to create professional painting estimates faster.',
    intro: 'A profitable painting estimate depends on preparation, surface condition, colors, coatings, access, protection, and cleanup—not square footage alone. Xtimator keeps those decisions attached to the walkthrough and structures them into a detailed draft your customer can follow.',
    painPoints: ['Prep work disappearing inside a lump sum', 'Room and finish details scattered in notes', 'Slow proposal writing after measuring all day'],
    outcomes: ['Scope organized by room or exterior area', 'Visible preparation and coating assumptions', 'Faster delivery of polished proposals'],
    projectExamples: ['Interior repainting', 'Exterior painting', 'Cabinet refinishing', 'Deck staining', 'Commercial turnover'],
    faqs: [
      { question: 'Can I separate prep from painting labor?', answer: 'Yes. The estimate can include distinct preparation, repair, priming, coating, protection, and cleanup line items.' },
      { question: 'Can I record colors and finishes during the walkthrough?', answer: 'Yes. Speak or type those decisions and attach supporting photos, then verify them in the draft before sending.' },
      { question: 'Does Xtimator calculate paint quantities automatically?', answer: 'It can help draft quantities from the context you provide, but the painting contractor should verify measurements, coverage rates, waste, and coat requirements.' },
    ],
  },
] as const

export function getSeoIndustry(slug: string): SeoIndustry | undefined {
  return SEO_INDUSTRIES.find((industry) => industry.slug === slug)
}
