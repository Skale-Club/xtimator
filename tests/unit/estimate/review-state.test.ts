import { describe, it, expect, beforeEach } from 'vitest'
import {
  isUnpriced,
  needsPriceCheck,
  openQuestions,
  readResolvedQuestions,
  resolveQuestions,
  summarizeReview,
  REVIEW_CHANGED_EVENT,
} from '@/lib/estimate/review-state'

/**
 * Notices review stage 1 (2026-11-20): one rule for what still needs the
 * owner's eye, shared by the row marks, the dock counter and the Share check.
 */

const ai = { description: 'Pet odor', unit_price: 24, price_source: 'ai_estimate', confidence: 'low' }

describe('row rules', () => {
  it('a described line with no positive price is unpriced; blank lines never count', () => {
    expect(isUnpriced({ description: 'Stairs', unit_price: 0 })).toBe(true)
    expect(isUnpriced({ description: 'Stairs', unit_price: null })).toBe(true)
    expect(isUnpriced({ description: 'Stairs', unit_price: 65 })).toBe(false)
    expect(isUnpriced({ description: '  ', unit_price: 0 })).toBe(false)
  })

  it('only an unconfirmed, AI-priced, low-confidence line needs a price check', () => {
    expect(needsPriceCheck(ai)).toBe(true)
    expect(needsPriceCheck({ ...ai, confidence: 'medium' })).toBe(false)
    expect(needsPriceCheck({ ...ai, isManuallyEdited: true })).toBe(false)
    // Confirmed and saved: price_source comes back null.
    expect(needsPriceCheck({ ...ai, price_source: null })).toBe(false)
    // Unpriced lines show the slot, never both marks.
    expect(needsPriceCheck({ ...ai, unit_price: 0 })).toBe(false)
  })
})

describe('answered / skipped questions (per browser)', () => {
  beforeEach(() => window.localStorage.clear())

  it('answered questions leave the list, skipped ones stay but stop counting', () => {
    const questions = ['Residential or commercial?', 'Stairs, pets or heavy stains?']
    resolveQuestions('est-1', { skipped: ['Stairs, pets or heavy stains?'] })
    let s = summarizeReview({ sections: [], questions, resolved: readResolvedQuestions('est-1') })
    expect(s.openQuestions).toEqual(questions)
    expect(s.pendingQuestions).toEqual(['Residential or commercial?'])

    resolveQuestions('est-1', { answered: ['  residential OR commercial? '] })
    s = summarizeReview({ sections: [], questions, resolved: readResolvedQuestions('est-1') })
    expect(s.openQuestions).toEqual(['Stairs, pets or heavy stains?'])
    expect(s.pendingQuestions).toEqual([])
  })

  it('answering a skipped question clears the skip; storage is per estimate', () => {
    resolveQuestions('est-1', { skipped: ['Q1'] })
    resolveQuestions('est-1', { answered: ['Q1'] })
    expect(readResolvedQuestions('est-1')).toEqual({ answered: ['q1'], skipped: [] })
    expect(openQuestions(['Q1'], readResolvedQuestions('est-2'))).toEqual(['Q1'])
  })

  it('announces changes so open surfaces refresh', () => {
    let fired = 0
    const on = () => fired++
    window.addEventListener(REVIEW_CHANGED_EVENT, on)
    resolveQuestions('est-1', { answered: ['Q'] })
    window.removeEventListener(REVIEW_CHANGED_EVENT, on)
    expect(fired).toBe(1)
  })

  it('broken storage reads as nothing resolved', () => {
    window.localStorage.setItem('xtm:review:est-1', '{not json')
    expect(readResolvedQuestions('est-1')).toEqual({ answered: [], skipped: [] })
    expect(readResolvedQuestions(null)).toEqual({ answered: [], skipped: [] })
  })
})

describe('summary', () => {
  it('counts unpriced lines and price checks separately and is clear only when nothing is left', () => {
    const sections = [{ items: [ai, { description: 'Stairs', unit_price: 0 }, { description: 'Carpet', unit_price: 360, price_source: 'price_book', confidence: 'high' }] }]
    const s = summarizeReview({ sections, questions: ['Q'] })
    expect(s).toMatchObject({ unpriced: 1, priceChecks: 1, pendingQuestions: ['Q'], clear: false })
    expect(summarizeReview({ sections: [{ items: [{ description: 'Carpet', unit_price: 360 }] }] }).clear).toBe(true)
  })
})
