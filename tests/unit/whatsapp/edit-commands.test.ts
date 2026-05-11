import { describe, expect, it } from 'vitest'
import { parseEditCommand, EDIT_HELP_MESSAGE } from '@/lib/whatsapp/edit-commands'

describe('parseEditCommand — base commands', () => {
  it('parses "send"', () => {
    expect(parseEditCommand('send')).toEqual({ kind: 'send' })
  })

  it('parses "SEND" (case insensitive)', () => {
    expect(parseEditCommand('SEND')).toEqual({ kind: 'send' })
  })

  it('parses "send!" (strips punctuation)', () => {
    expect(parseEditCommand('send!')).toEqual({ kind: 'send' })
  })

  it('parses "cancel"', () => {
    expect(parseEditCommand('cancel')).toEqual({ kind: 'cancel' })
  })

  it('parses "regenerate"', () => {
    expect(parseEditCommand('regenerate')).toEqual({ kind: 'regenerate' })
  })

  it('parses "regen" as regenerate alias', () => {
    expect(parseEditCommand('regen')).toEqual({ kind: 'regenerate' })
  })

  it('returns help on empty/whitespace input', () => {
    expect(parseEditCommand('')).toEqual({ kind: 'help' })
    expect(parseEditCommand('   ')).toEqual({ kind: 'help' })
  })

  it('returns help on unknown command', () => {
    expect(parseEditCommand('huh?')).toEqual({ kind: 'help' })
    expect(parseEditCommand('please send')).toEqual({ kind: 'help' })
  })
})

describe('parseEditCommand — edit total', () => {
  it('parses integer total', () => {
    expect(parseEditCommand('edit total 450')).toEqual({ kind: 'edit-total', value: 450 })
  })

  it('parses decimal total', () => {
    expect(parseEditCommand('edit total 450.75')).toEqual({ kind: 'edit-total', value: 450.75 })
  })

  it('strips $ and commas', () => {
    expect(parseEditCommand('edit total $1,200.50')).toEqual({ kind: 'edit-total', value: 1200.5 })
  })

  it('case insensitive on the field name', () => {
    expect(parseEditCommand('Edit Total 100')).toEqual({ kind: 'edit-total', value: 100 })
  })

  it('returns help on non-numeric value', () => {
    expect(parseEditCommand('edit total abc')).toEqual({ kind: 'help' })
  })

  it('returns help on negative number', () => {
    expect(parseEditCommand('edit total -50')).toEqual({ kind: 'help' })
  })
})

describe('parseEditCommand — edit timeline/payment/summary', () => {
  it('parses timeline from quoted string', () => {
    expect(parseEditCommand('edit timeline "Job completes in 2 days"')).toEqual({
      kind: 'edit-timeline',
      value: 'Job completes in 2 days',
    })
  })

  it('parses timeline from unquoted rest-of-line', () => {
    expect(parseEditCommand('edit timeline Two days')).toEqual({
      kind: 'edit-timeline',
      value: 'Two days',
    })
  })

  it('parses payment terms with quoted string', () => {
    expect(parseEditCommand('edit payment "50% upfront, 50% on completion"')).toEqual({
      kind: 'edit-payment',
      value: '50% upfront, 50% on completion',
    })
  })

  it('parses summary', () => {
    expect(parseEditCommand('edit summary "Two-day deep clean"')).toEqual({
      kind: 'edit-summary',
      value: 'Two-day deep clean',
    })
  })

  it('accepts smart quotes', () => {
    expect(parseEditCommand('edit timeline “Smart quoted text”')).toEqual({
      kind: 'edit-timeline',
      value: 'Smart quoted text',
    })
  })

  it('returns help when value is missing', () => {
    expect(parseEditCommand('edit timeline')).toEqual({ kind: 'help' })
  })

  it('returns help for unknown field', () => {
    expect(parseEditCommand('edit color blue')).toEqual({ kind: 'help' })
  })
})

describe('parseEditCommand — set client', () => {
  it('parses client with quoted name + E.164 phone', () => {
    expect(parseEditCommand('client "Maria Silva" +15552223333')).toEqual({
      kind: 'set-client',
      name: 'Maria Silva',
      phone: '+15552223333',
    })
  })

  it('normalizes phone without leading +', () => {
    expect(parseEditCommand('client "Joe" 5552223333')).toEqual({
      kind: 'set-client',
      name: 'Joe',
      phone: '+5552223333',
    })
  })

  it('strips formatting from phone', () => {
    expect(parseEditCommand('client "Joe" (555) 222-3333')).toEqual({
      kind: 'set-client',
      name: 'Joe',
      phone: '+5552223333',
    })
  })

  it('returns help when name not quoted', () => {
    expect(parseEditCommand('client Joe 5552223333')).toEqual({ kind: 'help' })
  })

  it('returns help when phone missing', () => {
    expect(parseEditCommand('client "Joe"')).toEqual({ kind: 'help' })
  })

  it('returns help when phone is too short', () => {
    expect(parseEditCommand('client "Joe" 123')).toEqual({ kind: 'help' })
  })

  it('accepts smart quotes around name', () => {
    expect(parseEditCommand('client “Maria Silva” +15552223333')).toEqual({
      kind: 'set-client',
      name: 'Maria Silva',
      phone: '+15552223333',
    })
  })
})

describe('EDIT_HELP_MESSAGE', () => {
  it('mentions all the major commands', () => {
    expect(EDIT_HELP_MESSAGE).toContain('send')
    expect(EDIT_HELP_MESSAGE).toContain('cancel')
    expect(EDIT_HELP_MESSAGE).toContain('edit total')
    expect(EDIT_HELP_MESSAGE).toContain('edit timeline')
    expect(EDIT_HELP_MESSAGE).toContain('edit payment')
    expect(EDIT_HELP_MESSAGE).toContain('edit summary')
    expect(EDIT_HELP_MESSAGE).toContain('client')
    expect(EDIT_HELP_MESSAGE).toContain('regenerate')
  })
})
