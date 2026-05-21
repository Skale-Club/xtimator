export interface TourStep {
  id: string
  target: string        // CSS selector — matches data-tour attribute
  title: string         // English source text → passed through t()
  description: string   // English source text → passed through t()
}

// TOUR-QA-02: copy confirmed accurate in Phase 80 browser QA (2026-05-21)
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'new-project',
    target: '[data-tour="new-project"]',
    title: 'Start here',
    description: 'Create a project for each job site. Takes 10 seconds.',
  },
  {
    id: 'projects',
    target: '[data-tour="projects"]',
    title: 'Your projects',
    description: 'All job sites in one place. Open any to view its estimate.',
  },
  {
    id: 'clients',
    target: '[data-tour="clients"]',
    title: 'Client management',
    description: 'Clients are saved automatically when you send an estimate.',
  },
  {
    id: 'price-book',
    target: '[data-tour="price-book"]',
    title: 'Price Book',
    description: 'Save your most-used items to speed up future estimates.',
  },
  {
    id: 'language-toggle',
    target: '[data-tour="language-toggle"]',
    title: 'Send in any language',
    description: 'Switch languages | estimates can be sent in EN, PT, or ES.',
  },
]
