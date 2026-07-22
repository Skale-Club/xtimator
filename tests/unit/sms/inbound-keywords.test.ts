import { describe, it, expect } from 'vitest'
import { classifyInboundKeyword } from '@/lib/sms/inbound-keywords'

/**
 * Phase 176 plan 02 — Task 2 TDD tests for classifyInboundKeyword (CUST-03).
 *
 * Exact-match-after-normalize against Twilio's own literal default keyword
 * set (Operational Decision #4) — trim, strip trailing punctuation, uppercase,
 * then exact set membership. NEVER substring/NLP/fuzzy matching: a keyword
 * embedded in a longer sentence must resolve to 'other', not auto-suppress.
 */

const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']
const START_KEYWORDS = ['START', 'YES', 'UNSTOP']

describe('lib/sms/inbound-keywords — classifyInboundKeyword() (CUST-03)', () => {
  describe('stop-class', () => {
    for (const kw of STOP_KEYWORDS) {
      it(`classifies "${kw}" (upper/lower/mixed case) as 'stop'`, () => {
        expect(classifyInboundKeyword(kw)).toBe('stop')
        expect(classifyInboundKeyword(kw.toLowerCase())).toBe('stop')
        expect(
          classifyInboundKeyword(
            kw
              .split('')
              .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
              .join(''),
          ),
        ).toBe('stop')
      })
    }
  })

  describe('start-class', () => {
    for (const kw of START_KEYWORDS) {
      it(`classifies "${kw}" (upper/lower/mixed case) as 'start'`, () => {
        expect(classifyInboundKeyword(kw)).toBe('start')
        expect(classifyInboundKeyword(kw.toLowerCase())).toBe('start')
      })
    }
  })

  describe('help-class', () => {
    it('classifies HELP (mixed case) as \'help\'', () => {
      expect(classifyInboundKeyword('HELP')).toBe('help')
      expect(classifyInboundKeyword('help')).toBe('help')
      expect(classifyInboundKeyword('Help')).toBe('help')
    })
  })

  describe('normalization', () => {
    it('trims and strips trailing punctuation before matching', () => {
      expect(classifyInboundKeyword('STOP.')).toBe('stop')
      expect(classifyInboundKeyword('Stop!')).toBe('stop')
      expect(classifyInboundKeyword('  stop  ')).toBe('stop')
      expect(classifyInboundKeyword('STOP?')).toBe('stop')
      expect(classifyInboundKeyword('stop,')).toBe('stop')
    })
  })

  describe('never matches sentence-embedded keywords (Operational Decision #4)', () => {
    it('rejects a keyword embedded in a longer sentence → \'other\'', () => {
      expect(classifyInboundKeyword('please STOP texting me')).toBe('other')
      expect(classifyInboundKeyword('stop by later')).toBe('other')
    })
  })

  describe('edge cases', () => {
    it('empty string / whitespace-only → \'other\'', () => {
      expect(classifyInboundKeyword('')).toBe('other')
      expect(classifyInboundKeyword('   ')).toBe('other')
    })

    it('unrelated message → \'other\'', () => {
      expect(classifyInboundKeyword('What time works for the estimate?')).toBe('other')
    })
  })
})
