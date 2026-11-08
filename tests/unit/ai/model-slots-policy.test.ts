import { describe, it, expect } from 'vitest'
import {
  ESCALATION_LARGE_JOB_CHARS,
  decideDraftEscalation,
  isAllowedSlotModel,
  parseEscalationConfig,
  parseModelSlots,
  pickSlotModel,
  type EscalationConfig,
  type ModelSlot,
} from '@/lib/ai/model-policy'

const HAIKU = 'anthropic/claude-haiku-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'
const OPUS = 'anthropic/claude-opus-5'

describe('slot policy (Phase 4c)', () => {
  it.each(['vision', 'plan', 'review'] as ModelSlot[])('%s accepts Haiku, Sonnet and Opus', (slot) => {
    for (const m of [HAIKU, SONNET, OPUS]) expect(isAllowedSlotModel(slot, m)).toBe(true)
  })

  it.each(['draft', 'research'] as ModelSlot[])('%s accepts Sonnet and Opus but not Haiku', (slot) => {
    expect(isAllowedSlotModel(slot, SONNET)).toBe(true)
    expect(isAllowedSlotModel(slot, OPUS)).toBe(true)
    expect(isAllowedSlotModel(slot, HAIKU)).toBe(false)
  })

  it.each(['openai/gpt-5', 'google/gemini-2.5-flash', '', 'anthropic/claude-haiku-', 42, null, undefined])(
    'no slot accepts %s',
    (bad) => {
      for (const slot of ['vision', 'plan', 'draft', 'research', 'review'] as ModelSlot[]) {
        expect(isAllowedSlotModel(slot, bad)).toBe(false)
      }
    }
  )

  it('parseModelSlots keeps only valid slots and ignores unknown keys / non-objects', () => {
    expect(
      parseModelSlots({ vision: HAIKU, plan: 'openai/gpt-5', draft: HAIKU, research: OPUS, review: SONNET, extra: SONNET })
    ).toEqual({ vision: HAIKU, research: OPUS, review: SONNET })
    expect(parseModelSlots(undefined)).toEqual({})
    expect(parseModelSlots('x')).toEqual({})
    expect(parseModelSlots([HAIKU])).toEqual({})
  })

  it('pickSlotModel returns the fallback (today\'s default) for an absent or invalid slot', () => {
    expect(pickSlotModel({}, 'vision', 'DEFAULT')).toBe('DEFAULT')
    expect(pickSlotModel(undefined, 'plan', 'DEFAULT')).toBe('DEFAULT')
    expect(pickSlotModel({ draft: HAIKU }, 'draft', 'DEFAULT')).toBe('DEFAULT')
    expect(pickSlotModel({ vision: HAIKU }, 'vision', 'DEFAULT')).toBe(HAIKU)
  })
})

describe('escalation config parsing (Phase 4g)', () => {
  it('is disabled unless enabled === true with an Opus model', () => {
    expect(parseEscalationConfig(undefined)).toBeNull()
    expect(parseEscalationConfig({ enabled: false, model: OPUS })).toBeNull()
    expect(parseEscalationConfig({ enabled: 'true', model: OPUS })).toBeNull()
    expect(parseEscalationConfig({ enabled: true, model: SONNET })).toBeNull()
    expect(parseEscalationConfig({ enabled: true })).toBeNull()
    expect(parseEscalationConfig({ enabled: true, model: OPUS })).toEqual({ enabled: true, model: OPUS })
  })

  it('keeps only sane thresholds', () => {
    expect(
      parseEscalationConfig({ enabled: true, model: OPUS, minSections: 6, minTotalUsd: 20000, onLowScopeConfidence: true })
    ).toEqual({ enabled: true, model: OPUS, minSections: 6, minTotalUsd: 20000, onLowScopeConfidence: true })
    expect(parseEscalationConfig({ enabled: true, model: OPUS, minSections: -1, minTotalUsd: 'x' })).toEqual({
      enabled: true,
      model: OPUS,
    })
  })
})

describe('decideDraftEscalation (Phase 4g gating)', () => {
  const plan = (n: number, conf?: string) => ({ sections: Array.from({ length: n }, () => ({})), scope_confidence: conf })
  const cfg = (extra: Partial<EscalationConfig> = {}): EscalationConfig => ({ enabled: true, model: OPUS, ...extra })

  it('NEVER escalates when disabled (null config), whatever the job looks like', () => {
    expect(decideDraftEscalation(null, { plan: plan(50, 'low'), sourceChars: 10 ** 6, targetBudget: 10 ** 9 })).toEqual({
      escalate: false,
      reason: null,
    })
  })

  it('with a plan: escalates on minSections', () => {
    expect(decideDraftEscalation(cfg({ minSections: 6 }), { plan: plan(6), sourceChars: 0 }).escalate).toBe(true)
    expect(decideDraftEscalation(cfg({ minSections: 6 }), { plan: plan(5), sourceChars: 0 }).escalate).toBe(false)
  })

  it('with a plan: escalates on low scope confidence only when onLowScopeConfidence is set', () => {
    expect(decideDraftEscalation(cfg({ onLowScopeConfidence: true }), { plan: plan(1, 'low'), sourceChars: 0 }).reason).toBe(
      'low_scope_confidence'
    )
    expect(decideDraftEscalation(cfg(), { plan: plan(1, 'low'), sourceChars: 0 }).escalate).toBe(false)
    expect(decideDraftEscalation(cfg({ onLowScopeConfidence: true }), { plan: plan(1, 'high'), sourceChars: 0 }).escalate).toBe(false)
  })

  it('with a plan: long source text alone does NOT escalate (the plan decides)', () => {
    expect(decideDraftEscalation(cfg({ minSections: 6 }), { plan: plan(2), sourceChars: 10 ** 6 }).escalate).toBe(false)
  })

  it('without a plan: only the source-length threshold applies (sections / confidence are ignored)', () => {
    const c = cfg({ minSections: 1, onLowScopeConfidence: true })
    expect(decideDraftEscalation(c, { plan: null, sourceChars: ESCALATION_LARGE_JOB_CHARS - 1 }).escalate).toBe(false)
    expect(decideDraftEscalation(c, { plan: undefined, sourceChars: ESCALATION_LARGE_JOB_CHARS }).escalate).toBe(true)
  })

  it('target budget at or above minTotalUsd escalates; unset threshold or budget never does', () => {
    expect(decideDraftEscalation(cfg({ minTotalUsd: 5000 }), { sourceChars: 0, targetBudget: 5000 }).escalate).toBe(true)
    expect(decideDraftEscalation(cfg({ minTotalUsd: 5000 }), { sourceChars: 0, targetBudget: 4999 }).escalate).toBe(false)
    expect(decideDraftEscalation(cfg({ minTotalUsd: 5000 }), { sourceChars: 0, targetBudget: null }).escalate).toBe(false)
    expect(decideDraftEscalation(cfg(), { sourceChars: 0, targetBudget: 10 ** 9 }).escalate).toBe(false)
  })
})
