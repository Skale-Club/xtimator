// =============================================================================
// lib/blog/prompt.ts
//
// SOURCE OF TRUTH for the MACHINERY: xkedule/shared/blog-prompt.ts — sync
// changes to pickNextPillar / pickSeeded / assignPillar / buildPillarSection /
// buildInternalLinksSection / buildKeywordDedupSection / sanitizeGeneratedLinks
// back there (autoblog-parity XT-05, MASTER §5).
//
// The PILLARS are Xtimator's own. Every other product in the org writes as a
// business talking to its own customers; this blog is a SaaS talking to the
// contractors who use it — landscapers, plumbers, painters, HVAC. Porting
// another product's pillars would have produced posts in the wrong voice about
// the wrong reader.
//
// Why pillars exist at all: a single "write something useful for contractors"
// instruction collapses onto one archetype within a handful of posts. Breadth
// cannot be requested in an adjective; it has to be scheduled. Each run gets one
// pillar, rotated least-recently-used, plus a title shape and a length band.
//
// Pure module: no I/O, no clock of its own, so every fragment is assertable.
// =============================================================================

/**
 * Tell the model what day it is.
 *
 * A model has no clock. Asked for something "timely" it guesses from its
 * training distribution rather than from today, which is how a blog ends up
 * publishing a busy-season checklist in the dead of winter.
 */
export function todaySection(at: Date, timeZone: string): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(at)

  let today: string
  let zone = timeZone
  try {
    today = format(timeZone)
  } catch {
    zone = 'UTC'
    today = format('UTC')
  }

  return [
    `TODAY IS ${today} (${zone}).`,
    'You have no clock of your own, so treat this as fact and work the season out from it.',
    'Any seasonal or calendar hook must match this date — the current weeks or the ones just ahead, never one that has already passed.',
  ].join('\n')
}

// ─── Length and title shape ──────────────────────────────────────────────────

export interface BlogLengthProfile {
  id: 'quick' | 'standard' | 'deep'
  words: string
  guidance: string
}

export const BLOG_LENGTH_PROFILES: readonly BlogLengthProfile[] = [
  { id: 'quick', words: '700-1000', guidance: 'A focused, direct answer. No padding to look longer than the answer needs.' },
  { id: 'standard', words: '1200-1600', guidance: 'A solid article with concrete detail and worked examples.' },
  { id: 'deep', words: '2000-2600', guidance: 'A definitive guide: thorough, structured, with an FAQ section at the end.' },
] as const

export const BLOG_TITLE_STYLES: Readonly<Record<string, string>> = {
  question: 'Phrase the title as the question a contractor would actually type into a search engine.',
  'how-to': 'Start the title with "How to ...".',
  numbered: 'Use a numbered-list title (e.g. "7 ..."), and make the post deliver exactly that list.',
  statement: 'Use a plain, confident statement as the title. No colon, no subtitle.',
  'two-part': 'A two-part title with a colon is allowed here ("Topic: what it means for your bids").',
}

// ─── Editorial pillars (Xtimator: estimating software for US trades) ─────────

export interface BlogPillar {
  id: string
  label: string
  /** Injected into the system message for both the topic and the content call. */
  guidance: string
  titleStyles: readonly string[]
  lengths: readonly BlogLengthProfile['id'][]
  /** Data the pillar cannot work without; used to filter availability. */
  requires?: 'rss'
}

export const BLOG_PILLARS: readonly BlogPillar[] = [
  {
    id: 'estimating-playbook',
    label: 'Estimating playbook',
    guidance:
      'A process a contractor can run tomorrow on a real job: what to measure, in what order, what to ask the homeowner before quoting, and how to know the number is right. Specific enough to follow, not a generic checklist.',
    titleStyles: ['how-to', 'numbered'],
    lengths: ['standard', 'deep'],
  },
  {
    id: 'pricing',
    label: 'Pricing and margin',
    guidance:
      'How a price is actually built: labor burden, materials, overhead, the margin that survives a bad week. Explain the mechanics and what drives each number up or down. NEVER invent dollar figures, regional rates or benchmarks — reason about drivers and ratios instead.',
    titleStyles: ['question', 'statement', 'two-part'],
    lengths: ['standard', 'deep'],
  },
  {
    id: 'mistake-teardown',
    label: 'Costly mistake, dissected',
    guidance:
      'ONE mistake that quietly loses money on jobs: how it shows up, why it looks reasonable in the moment, what it costs over a season, and what to do instead. No strawmen — the mistake has to be one a competent contractor makes.',
    titleStyles: ['statement', 'question'],
    lengths: ['quick', 'standard'],
  },
  {
    id: 'winning-work',
    label: 'Winning the job',
    guidance:
      'What happens between the walkthrough and the signature: how the estimate is presented, follow-up timing, what makes a homeowner choose the higher bid. Practical and specific to trades, not general sales advice.',
    titleStyles: ['how-to', 'question', 'numbered'],
    lengths: ['quick', 'standard'],
  },
  {
    id: 'trade-deep-dive',
    label: 'One trade, in depth',
    guidance:
      'Write for ONE trade (landscaping, plumbing, electrical, HVAC, painting, roofing, cleaning, concrete) and let its constraints drive every recommendation: how that trade scopes work, what its estimates usually miss, what a change order looks like. Address that reader directly.',
    titleStyles: ['statement', 'two-part', 'question'],
    lengths: ['standard'],
  },
  {
    id: 'comparison',
    label: 'Honest comparison',
    guidance:
      'Compare two real options a contractor weighs — spreadsheet vs software, per-hour vs per-job pricing, subcontracting vs hiring. Concrete criteria: effort, time, risk, what drives the cost. Give a verdict per scenario, including when the simpler option genuinely wins.',
    titleStyles: ['question', 'statement', 'numbered'],
    lengths: ['standard'],
  },
  {
    id: 'myth-busting',
    label: 'Myth-busting',
    guidance:
      'Take claims that circulate in the trades about pricing, bidding or software and test each one: verdict first (true / false / it depends), then the reasoning. Punchy and specific.',
    titleStyles: ['numbered', 'question'],
    lengths: ['quick', 'standard'],
  },
  {
    id: 'industry-reaction',
    label: 'Reacting to the news',
    guidance:
      'Start from the SOURCE item in the system message and explain what it changes in practice for a contractor bidding work this month: what to do about it, what to ignore, and why. Do not summarise the source — react to it with a point of view.',
    titleStyles: ['statement', 'question', 'two-part'],
    lengths: ['quick', 'standard'],
    requires: 'rss',
  },
] as const

export interface PillarAvailabilityData {
  /** Whether this run has an RSS item to react to. */
  hasRssItem: boolean
}

export function availablePillars(data: PillarAvailabilityData): BlogPillar[] {
  return BLOG_PILLARS.filter((p) => (p.requires === 'rss' ? data.hasRssItem : true))
}

/**
 * Least-recently-used rotation. `recentPillarIds` is newest-first (the order job
 * history naturally comes back in). A pillar never used wins outright; otherwise
 * the one whose last use is furthest back. Ties keep catalogue order, so the walk
 * through the pillars is stable and predictable.
 */
export function pickNextPillar(recentPillarIds: string[], available: BlogPillar[]): BlogPillar {
  if (available.length === 0) throw new Error('no pillars available')
  let best = available[0]
  let bestAge = -1
  for (const pillar of available) {
    const idx = recentPillarIds.indexOf(pillar.id)
    const age = idx === -1 ? Number.POSITIVE_INFINITY : idx
    if (age > bestAge) {
      best = pillar
      bestAge = age
    }
  }
  return best
}

/** Deterministic pick — seeded per run so runs vary but tests do not. */
export function pickSeeded<T>(options: readonly T[], seed: number): T {
  if (options.length === 0) throw new Error('no options')
  return options[Math.abs(Math.trunc(seed)) % options.length]
}

export interface PillarAssignment {
  pillar: BlogPillar
  titleStyleId: string
  length: BlogLengthProfile
}

/** djb2-style string hash. No cryptographic property needed — see assignPillar. */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i)
  }
  return Math.abs(h | 0)
}

/**
 * The seed alone collapses in steady state whenever it advances by a constant:
 * the rotation cycles N pillars in a stable order, so one pillar's seeds form an
 * arithmetic sequence, and if gcd(N, titleStyles.length) > 1, indexing by the raw
 * seed locks that pillar onto a SINGLE title shape forever. Adding a constant
 * cannot fix it — the residue is unchanged. Hashing the seed INTO the pillar id
 * does, because the hash outputs for k, k+N, k+2N are not a progression at all.
 */
export function assignPillar(
  recentPillarIds: string[],
  data: PillarAvailabilityData,
  seed: number,
): PillarAssignment {
  const pillar = pickNextPillar(recentPillarIds, availablePillars(data))
  const titleStyleId = pickSeeded(pillar.titleStyles, hashString(`${pillar.id}:${seed}`))
  const lengthId = pickSeeded(pillar.lengths, hashString(`${pillar.id}:len:${seed}`))
  const length = BLOG_LENGTH_PROFILES.find((l) => l.id === lengthId)!
  return { pillar, titleStyleId, length }
}

export function buildPillarSection(a: PillarAssignment, extras?: string): string {
  const lines = [
    `EDITORIAL ASSIGNMENT for this post — pillar "${a.pillar.label}":`,
    a.pillar.guidance,
    `TITLE SHAPE: ${BLOG_TITLE_STYLES[a.titleStyleId] ?? BLOG_TITLE_STYLES.statement} Do not use the "Topic: Explanatory Subtitle" colon format unless this shape explicitly allows it.`,
    `LENGTH TARGET: ${a.length.words} words. ${a.length.guidance}`,
    'ONE POST, ONE SUBJECT: commit to this assignment. Other topics get at most a passing sentence with an internal link where one fits — never their own section.',
  ]
  if (extras && extras.trim()) lines.push(extras.trim())
  return lines.join('\n')
}

// ─── Grounded context sections ───────────────────────────────────────────────

export interface InternalLink {
  label: string
  path: string
}

export function buildInternalLinksSection(links: InternalLink[]): string {
  if (links.length === 0) return ''
  return [
    'INTERNAL LINKS — include 1 to 3 of these in the post body as HTML anchors, where they genuinely help the reader:',
    ...links.map((l) => `- <a href="${l.path}">${l.label}</a>`),
    'Use each at most once, with natural anchor text (rewrite the label to fit the sentence). These are the ONLY links allowed — no other internal paths, no external URLs.',
  ].join('\n')
}

export function buildKeywordDedupSection(recentFocusKeywords: string[]): string {
  const kws = Array.from(
    new Set(recentFocusKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 10)
  if (kws.length === 0) return ''
  return [
    'RECENTLY USED FOCUS KEYWORDS (each already has a post competing for it):',
    kws.join(', '),
    'Choose a DIFFERENT primary focus keyword for this post, so posts on this site do not compete with each other.',
  ].join('\n')
}

/**
 * Enforcement for buildInternalLinksSection: models occasionally invent hrefs,
 * and a hallucinated link on a live post is worse than no link at all.
 *
 * Every surviving anchor points at exactly one of `allowedPaths`; everything else
 * is unwrapped to its inner text, so the prose survives and only the link dies.
 * Rebuilt anchors carry href only, so a stray target or onclick cannot survive
 * even on a link we keep.
 *
 * Non-string input returns '' rather than throwing: the caller feeds this model
 * output, where an optional field is often missing entirely.
 */
export function sanitizeGeneratedLinks(html: unknown, allowedPaths: string[]): string {
  if (typeof html !== 'string') return ''
  const allowed = new Set(allowedPaths.map((p) => p.trim()).filter(Boolean))

  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (match, inner: string) => {
    const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(match)
    const href = hrefMatch?.[1]?.trim() ?? ''
    return allowed.has(href) ? `<a href="${href}">${inner}</a>` : inner
  })
}
