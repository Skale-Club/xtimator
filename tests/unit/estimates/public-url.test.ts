import { describe, expect, it } from 'vitest'
import {
  PUBLIC_SLUG_TOKEN_LENGTH,
  generatePublicSlugToken,
  slugify,
  buildEstimatePublicPath,
  parsePublicSlugParam,
} from '@/lib/estimate/public-url'

describe('generatePublicSlugToken', () => {
  it('Test 1: returns a string of exactly 12 characters matching [A-Za-z0-9_-]{12}', () => {
    const token = generatePublicSlugToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(token.length).toBe(12)
  })

  it('Test 2: two consecutive calls return different values', () => {
    const a = generatePublicSlugToken()
    const b = generatePublicSlugToken()
    expect(a).not.toBe(b)
  })
})

describe('slugify', () => {
  it('Test 3: lowercases, replaces non-alphanumeric runs with a single hyphen, trims leading/trailing hyphens', () => {
    expect(slugify('Kitchen Remodel!!')).toBe('kitchen-remodel')
    expect(slugify('  Bathroom -- Reno  ')).toBe('bathroom-reno')
  })
})

describe('buildEstimatePublicPath', () => {
  it('Test 4: returns the FRIENDLY path when both company.slug and estimate.public_slug_token are present', () => {
    const path = buildEstimatePublicPath(
      { slug: 'acme-plumbing', name: 'Acme Plumbing' },
      { id: '1', public_slug_token: 'TEST-TOKEN01', share_token: 'legacy-token', project_name: 'Kitchen Remodel' }
    )
    expect(path).toBe('/estimate/acme-plumbing/kitchen-remodel-TEST-TOKEN01')
  })

  it('Test 5: falls back to the LEGACY path when company.slug is null', () => {
    const path = buildEstimatePublicPath(
      { slug: null, name: 'Acme Plumbing' },
      { id: '1', public_slug_token: 'TEST-TOKEN01', share_token: 'legacy-token', project_name: 'Kitchen Remodel' }
    )
    expect(path).toBe('/estimate/legacy-token')
  })

  it('Test 6: falls back to the LEGACY path when estimate.public_slug_token is null', () => {
    const path = buildEstimatePublicPath(
      { slug: 'acme-plumbing', name: 'Acme Plumbing' },
      { id: '1', public_slug_token: null, share_token: 'legacy-token', project_name: 'Kitchen Remodel' }
    )
    expect(path).toBe('/estimate/legacy-token')
  })

  it('Test 7: uses the literal slug "estimate" when estimate.project_name is absent/empty', () => {
    const pathAbsent = buildEstimatePublicPath(
      { slug: 'acme-plumbing', name: 'Acme Plumbing' },
      { id: '1', public_slug_token: 'TEST-TOKEN01', share_token: 'legacy-token' }
    )
    expect(pathAbsent).toBe('/estimate/acme-plumbing/estimate-TEST-TOKEN01')

    const pathEmpty = buildEstimatePublicPath(
      { slug: 'acme-plumbing', name: 'Acme Plumbing' },
      { id: '1', public_slug_token: 'TEST-TOKEN01', share_token: 'legacy-token', project_name: '' }
    )
    expect(pathEmpty).toBe('/estimate/acme-plumbing/estimate-TEST-TOKEN01')
  })
})

describe('parsePublicSlugParam', () => {
  it('Test 8: correctly round-trips with what buildEstimatePublicPath produced', () => {
    const path = buildEstimatePublicPath(
      { slug: 'acme-plumbing', name: 'Acme Plumbing' },
      { id: '1', public_slug_token: 'TEST-TOKEN01', share_token: 'legacy-token', project_name: 'Kitchen Remodel' }
    )
    // path = /estimate/acme-plumbing/kitchen-remodel-TEST-TOKEN01
    const estimateSlugParam = path.split('/')[3]
    const parsed = parsePublicSlugParam(estimateSlugParam)
    expect(parsed).toEqual({ estimateSlug: 'kitchen-remodel', shortToken: 'TEST-TOKEN01' })
  })

  it('Test 9: returns null for a param shorter than PUBLIC_SLUG_TOKEN_LENGTH + 2', () => {
    const tooShort = 'a'.repeat(PUBLIC_SLUG_TOKEN_LENGTH)
    expect(parsePublicSlugParam(tooShort)).toBeNull()
    const barelyTooShort = 'x-' + 'a'.repeat(PUBLIC_SLUG_TOKEN_LENGTH - 1)
    expect(parsePublicSlugParam(barelyTooShort)).toBeNull()
  })

  it('Test 10: returns null when there is no hyphen immediately before the trailing 12-char region', () => {
    const malformed = 'x' + 'a'.repeat(PUBLIC_SLUG_TOKEN_LENGTH + 1)
    expect(parsePublicSlugParam(malformed)).toBeNull()
  })
})
