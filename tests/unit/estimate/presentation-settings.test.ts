import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import * as presentationSettings from '@/lib/estimate/presentation-settings'
import {
  resolvePresentationSettings,
  isSectionVisible,
  hasEstimateBeenSentOrViewed,
} from '@/lib/estimate/presentation-settings'

// PRESENT-01..05: unit coverage for the ONE pure resolver module for
// per-estimate presentation + pricing-override settings. Mirrors
// compute-totals-guards.test.ts's style: plain object literals, hand-computed
// goldens, no mocking, no fixtures.
describe('presentation-settings resolver: PRESENT-01..05, retrocompat, GUARD-03', () => {
  it('resolvePresentationSettings(NULL) returns full defaults: all 7 sections visible, tax default, discount/deposit disabled', () => {
    const resolved = resolvePresentationSettings(null)

    expect(resolved.sections).toEqual({
      summary: true,
      sections: true,
      payment_terms: true,
      timeline: true,
      warranty_terms: true,
      notes: true,
      photos: true,
    })
    expect(resolved.tax).toEqual({ mode: 'default' })
    expect(resolved.discount).toEqual({ enabled: false })
    expect(resolved.deposit).toEqual({ enabled: false })
  })

  it('retrocompat: resolvePresentationSettings(undefined) — simulating a legacy row with no key at all — resolves IDENTICALLY to resolvePresentationSettings(null)', () => {
    const fromUndefined = resolvePresentationSettings(undefined)
    const fromNull = resolvePresentationSettings(null)

    expect(fromUndefined).toEqual(fromNull)
  })

  it('a partial object { sections: { summary: false } } resolves with summary false and every OTHER section key still true (fill-from-defaults, never throws)', () => {
    const resolved = resolvePresentationSettings({ sections: { summary: false } })

    expect(resolved.sections.summary).toBe(false)
    expect(resolved.sections.sections).toBe(true)
    expect(resolved.sections.payment_terms).toBe(true)
    expect(resolved.sections.timeline).toBe(true)
    expect(resolved.sections.warranty_terms).toBe(true)
    expect(resolved.sections.notes).toBe(true)
    expect(resolved.sections.photos).toBe(true)
  })

  it('non-destructive hiding proof: hiding a section via presentation_settings never reads/writes the separate content object', () => {
    const content = { summary: 'Some summary text' }
    const raw = { sections: { summary: false } }

    const resolved = resolvePresentationSettings(raw)

    expect(isSectionVisible(resolved, 'summary')).toBe(false)
    // The content object is a completely separate object the resolver never touched.
    expect(content.summary).toBe('Some summary text')
  })

  it('round-trip: sections.notes: false survives a JSON.parse(JSON.stringify(...)) DB round-trip, then flips back to true with no data loss', () => {
    const settingsOff = { sections: { notes: false } }
    const roundTrippedOff = JSON.parse(JSON.stringify(settingsOff))
    const resolvedOff = resolvePresentationSettings(roundTrippedOff)
    expect(isSectionVisible(resolvedOff, 'notes')).toBe(false)

    const settingsOn = { sections: { notes: true } }
    const roundTrippedOn = JSON.parse(JSON.stringify(settingsOn))
    const resolvedOn = resolvePresentationSettings(roundTrippedOn)
    expect(isSectionVisible(resolvedOn, 'notes')).toBe(true)
  })

  it('tax override mode "off" preserves preservedRate as a value DISTINCT from customRate, unchanged across mode flips on the same object', () => {
    const raw = { tax: { mode: 'off' as const, customRate: 0.05, preservedRate: 0.0825 } }

    const resolvedOff = resolvePresentationSettings(raw)
    expect(resolvedOff.tax.mode).toBe('off')
    expect(resolvedOff.tax.customRate).toBe(0.05)
    expect(resolvedOff.tax.preservedRate).toBe(0.0825)

    const rawBackToDefault = { tax: { mode: 'default' as const, customRate: 0.05, preservedRate: 0.0825 } }
    const resolvedDefault = resolvePresentationSettings(rawBackToDefault)
    expect(resolvedDefault.tax.preservedRate).toBe(0.0825)

    const rawBackToCustom = { tax: { mode: 'custom' as const, customRate: 0.05, preservedRate: 0.0825 } }
    const resolvedCustom = resolvePresentationSettings(rawBackToCustom)
    expect(resolvedCustom.tax.preservedRate).toBe(0.0825)
  })

  it('malformed tax value { mode: "bogus" } degrades to DEFAULT_TAX_OVERRIDE ({ mode: "default" }), never throws', () => {
    expect(() => resolvePresentationSettings({ tax: { mode: 'bogus' } })).not.toThrow()
    const resolved = resolvePresentationSettings({ tax: { mode: 'bogus' } })
    expect(resolved.tax).toEqual({ mode: 'default' })
  })

  it('malformed tax value that is not even an object (a bare string or a number) also degrades to DEFAULT_TAX_OVERRIDE, never throws', () => {
    expect(() => resolvePresentationSettings({ tax: 'off' })).not.toThrow()
    expect(resolvePresentationSettings({ tax: 'off' }).tax).toEqual({ mode: 'default' })

    expect(() => resolvePresentationSettings({ tax: 42 })).not.toThrow()
    expect(resolvePresentationSettings({ tax: 42 }).tax).toEqual({ mode: 'default' })
  })

  it('structural: the module exports exactly the single predicate set — resolvePresentationSettings, isSectionVisible, hasEstimateBeenSentOrViewed — no second/rogue visibility predicate (PRESENT-04)', () => {
    const exportedFunctionNames = Object.keys(presentationSettings).filter(
      (key) => typeof (presentationSettings as Record<string, unknown>)[key] === 'function'
    )

    expect(exportedFunctionNames.sort()).toEqual(
      ['hasEstimateBeenSentOrViewed', 'isSectionVisible', 'resolvePresentationSettings'].sort()
    )
  })

  it('hasEstimateBeenSentOrViewed returns true when sent_at is set and viewed_at is null (sent or viewed)', () => {
    expect(
      hasEstimateBeenSentOrViewed({ sent_at: '2026-07-01T00:00:00Z', viewed_at: null })
    ).toBe(true)
  })

  it('hasEstimateBeenSentOrViewed returns true when viewed_at is set and sent_at is null (sent or viewed)', () => {
    expect(
      hasEstimateBeenSentOrViewed({ sent_at: null, viewed_at: '2026-07-02T00:00:00Z' })
    ).toBe(true)
  })

  it('hasEstimateBeenSentOrViewed returns false when both sent_at and viewed_at are null (sent or viewed)', () => {
    expect(hasEstimateBeenSentOrViewed({ sent_at: null, viewed_at: null })).toBe(false)
  })

  it('GUARD-03 static boundary: the source file has no compute-totals import (zero interaction with the deterministic totals engine)', () => {
    const source = readFileSync('lib/estimate/presentation-settings.ts', 'utf8')
    expect(source).not.toContain('compute-totals')
  })
})
