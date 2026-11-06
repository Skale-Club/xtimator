import { describe, expect, it } from 'vitest'
import { conceptKey, conceptMapKey, priceConcept } from '@/lib/estimate/pricing/concept-key'

// SEED-057 Phase E: one stable key for "the same piece of work".

describe('conceptKey', () => {
  it.each([
    ['Install toilet', 'Toilet installation'],
    ['Install toilet', 'Replace commode'],
    ['Couch cleaning', 'Sofa cleaning'],
    ['Paint walls', 'Walls painting'],
    ['Remove and haul away old decking', 'Old decking, removal and haul away'],
    ['Baseboard', 'baseboards'],
    ['Paint  WALLS!', 'paint walls'],
    ['Pintura das paredes', 'Pintura paredes'],
  ])('%s == %s', (a, b) => {
    expect(conceptKey(a)).toBe(conceptKey(b))
    expect(conceptKey(a)).not.toBe('')
  })

  it.each([
    ['Interior painting', 'Exterior painting'],
    ['2 bedroom cleaning', '3 bedroom cleaning'],
    ['Install toilet', 'Install faucet'],
    ['Paint walls', 'Paint ceiling'],
    ['Replace 40 gal water heater', 'Replace 50 gal water heater'],
  ])('%s != %s (a substituted word or number never collapses)', (a, b) => {
    expect(conceptKey(a)).not.toBe(conceptKey(b))
  })

  it('labor, materials and supply are NOT filler: they change the price', () => {
    expect(conceptKey('Paint walls - labor')).not.toBe(conceptKey('Paint walls - materials'))
    expect(conceptKey('Paint walls - labor')).not.toBe(conceptKey('Paint walls'))
    expect(conceptKey('Supply and install toilet')).not.toBe(conceptKey('Install toilet'))
    expect(conceptKey('Provided paint')).not.toBe(conceptKey('Paint'))
  })

  it('a boiler is not a water heater, and a water heater is not a furnace', () => {
    expect(conceptKey('Replace boiler')).not.toBe(conceptKey('Replace water heater'))
    expect(conceptKey('Replace water heater')).not.toBe(conceptKey('Replace furnace'))
    expect(conceptKey('Replace water heater')).toBe(conceptKey('Replace hot water tank'))
    expect(conceptKey('Replace heater')).toBe(conceptKey('Replace furnace'))
  })

  it('is deterministic and independent of word order', () => {
    expect(conceptKey('haul away debris')).toBe(conceptKey('debris haul away'))
    expect(conceptKey('Install toilet')).toBe(conceptKey('Install toilet'))
  })

  it('folds accents and punctuation', () => {
    expect(conceptKey('Instalação de fiação')).toBe(conceptKey('instalacao fiacao'))
    expect(conceptKey('Cleaning (deep) - kitchen')).toBe(conceptKey('cleaning deep kitchen'))
  })

  it('returns an empty key when nothing usable is left', () => {
    expect(conceptKey('')).toBe('')
    expect(conceptKey('the of and')).toBe('')
  })

  it('does not stem short words or double-s words into nonsense', () => {
    expect(conceptKey('glass')).toBe('glass')
    expect(conceptKey('bus')).toBe('bus')
    expect(conceptKey('boxes')).toBe('box')
  })
})

describe('priceConcept / conceptMapKey', () => {
  it('files a line under its concept and canonical unit', () => {
    expect(priceConcept('Paint walls', 'sqft')).toEqual({ key: conceptKey('Paint walls'), unit: 'sq ft' })
    expect(priceConcept('Paint walls', 'SQ. FT.')).toEqual(priceConcept('Paint walls', 'sq ft'))
  })

  it('the same words in a different unit are a different price concept', () => {
    expect(conceptMapKey(priceConcept('Paint walls', 'sq ft'))).not.toBe(
      conceptMapKey(priceConcept('Paint walls', 'job')),
    )
  })

  it('a missing unit is its own bucket', () => {
    expect(priceConcept('Paint walls', null).unit).toBe('')
    expect(priceConcept('Paint walls', undefined).unit).toBe('')
  })
})
