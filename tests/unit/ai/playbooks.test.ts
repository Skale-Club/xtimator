import { describe, expect, it } from 'vitest'
import {
  PLAYBOOKS,
  PLAYBOOK_IDS,
  detectTradeFromText,
  getPlaybook,
  matchTradeLabel,
  resolvePlaybook,
} from '@/lib/ai/playbooks'
import { exemplarPrompt, playbookPrompt } from '@/lib/ai/prompt-sections'
import { CANONICAL_UNITS } from '@/lib/ai/units'

// SEED-057 Phase B: the playbooks are plain data the owner reviews. These tests
// keep them well-formed (so a typo cannot ship) and the resolver predictable.

const TOKENS = (s: string) => Math.ceil(s.length / 4)

describe('playbook data', () => {
  it('covers the eight trades plus general', () => {
    expect([...PLAYBOOK_IDS].sort()).toEqual(
      ['cleaning', 'electrical', 'general', 'hvac', 'landscaping', 'painting', 'plumbing', 'remodel', 'roofing'],
    )
  })

  it.each(PLAYBOOK_IDS)('%s is well-formed', (id) => {
    const pb = getPlaybook(id)
    expect(pb.id).toBe(id)
    expect(pb.sections.length).toBeGreaterThanOrEqual(3)
    expect(new Set(pb.sections).size).toBe(pb.sections.length)
    expect(pb.alwaysItemise.length).toBeGreaterThan(0)
    expect(pb.defaultExclusions.length).toBeGreaterThan(0)
    expect(pb.formulas.length).toBeGreaterThan(0)
    expect(pb.mandatory.length).toBeGreaterThan(0)
    for (const m of pb.mandatory) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.match.length).toBeGreaterThan(0)
      for (const word of m.match) expect(word).toBe(word.toLowerCase())
    }
    // Everything the matchers compare against is lowercase.
    for (const k of [...pb.keywords, ...pb.aliases]) expect(k).toBe(k.toLowerCase())
  })

  it.each(PLAYBOOK_IDS)('%s example follows its own contract', (id) => {
    const pb = getPlaybook(id)
    const items = pb.example.sections.flatMap((s) => s.items)
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.length).toBeLessThanOrEqual(10)
    for (const section of pb.example.sections) {
      // Example sections use the playbook's own vocabulary, in order.
      expect(pb.sections).toContain(section.title)
    }
    const order = pb.example.sections.map((s) => pb.sections.indexOf(s.title))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const item of items) {
      expect(CANONICAL_UNITS as readonly string[]).toContain(item.unit)
      expect(item.quantity).toBeGreaterThan(0)
      expect(item.unitPrice).toBeGreaterThan(0)
      expect(item.basis.length).toBeGreaterThan(0)
    }
    expect(pb.example.assumptions.length).toBeGreaterThan(0)
    expect(pb.example.exclusions.length).toBeGreaterThan(0)
  })

  it.each(PLAYBOOK_IDS)('%s example stays under ~600 tokens', (id) => {
    expect(TOKENS(exemplarPrompt(getPlaybook(id)))).toBeLessThan(600)
  })

  it.each(PLAYBOOK_IDS)('%s renders its section order, exclusions and formulas', (id) => {
    const pb = getPlaybook(id)
    const text = playbookPrompt(pb)
    expect(text).toContain(`## Trade playbook: ${pb.label}`)
    expect(text).toContain(pb.sections.join(' > '))
    expect(text).toContain(pb.defaultExclusions[0])
    expect(text).toContain(pb.formulas[0])
  })
})

describe('resolvePlaybook', () => {
  it('an explicit trade wins over everything', () => {
    const pb = resolvePlaybook({
      detectedTrade: 'roofing',
      industry: 'painting',
      projectType: 'cleaning',
      text: 'paint the walls with two coats of primer',
    })
    expect(pb.id).toBe('roofing')
  })

  it('what was asked for beats the configured industry', () => {
    const pb = resolvePlaybook({
      industry: 'construction',
      projectType: 'General',
      text: 'We need to clean the carpet and the couch, a deep clean before move out.',
    })
    expect(pb.id).toBe('cleaning')
  })

  it('reads Portuguese source material', () => {
    const pb = resolvePlaybook({ text: 'Preciso de pintura na sala e no quarto, com tinta lavavel.' })
    expect(pb.id).toBe('painting')
  })

  it('one stray keyword is not enough', () => {
    expect(detectTradeFromText('the panel was fine, we just need a fence')).toBeNull()
  })

  it('a tie is not a signal', () => {
    expect(detectTradeFromText('paint the fence and clean the roof')).toBeNull()
  })

  it('falls back to the project type, then the industry, then general', () => {
    expect(resolvePlaybook({ projectType: 'plumbing', industry: 'painting', text: 'x' }).id).toBe('plumbing')
    expect(resolvePlaybook({ projectType: 'General', industry: 'HVAC' }).id).toBe('hvac')
    expect(resolvePlaybook({ projectType: 'General', industry: 'Pool Service' }).id).toBe('general')
    expect(resolvePlaybook({}).id).toBe('general')
  })

  it('matches configured labels through aliases and keywords', () => {
    expect(matchTradeLabel('Residential Cleaning')).toBe('cleaning')
    expect(matchTradeLabel('General Contractor')).toBe('remodel')
    expect(matchTradeLabel('Lawn Care')).toBe('landscaping')
    expect(matchTradeLabel('Heating & Air Conditioning')).toBe('hvac')
    expect(matchTradeLabel('Eletricista')).toBe('electrical')
    expect(matchTradeLabel('general')).toBeNull()
    expect(matchTradeLabel('')).toBeNull()
    expect(matchTradeLabel(null)).toBeNull()
  })

  it('every playbook is reachable from its own id', () => {
    for (const id of PLAYBOOK_IDS) {
      if (id === 'general') continue
      expect(matchTradeLabel(id)).toBe(id)
      expect(PLAYBOOKS[id].id).toBe(id)
    }
  })
})
