/**
 * Classifies an inbound SMS body against Twilio's own literal default
 * keyword set (Operational Decision #4, 176-RESEARCH.md) — exact-match-
 * after-normalize only, never NLP/fuzzy/substring intent guessing.
 *
 * Normalization: trim surrounding whitespace, strip trailing punctuation
 * (., !, ?, ,), uppercase, then exact-match against the keyword sets below.
 * A keyword embedded in a longer sentence (e.g. "please STOP texting me")
 * is 'other' — only Twilio's own bare-keyword convention is honored.
 */
export type InboundKeywordType = 'stop' | 'start' | 'help' | 'other'

const STOP_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'REVOKE',
  'OPTOUT',
])

const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP'])

const HELP_KEYWORDS = new Set(['HELP'])

export function classifyInboundKeyword(body: string): InboundKeywordType {
  const normalized = body
    .trim()
    .replace(/[.!?,]+$/, '')
    .toUpperCase()

  if (STOP_KEYWORDS.has(normalized)) return 'stop'
  if (START_KEYWORDS.has(normalized)) return 'start'
  if (HELP_KEYWORDS.has(normalized)) return 'help'
  return 'other'
}
