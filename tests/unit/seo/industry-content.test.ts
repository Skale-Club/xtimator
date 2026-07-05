import { describe, expect, it } from 'vitest'
import { SEO_INDUSTRIES, getSeoIndustry } from '@/lib/seo/industries'

describe('curated industry SEO content', () => {
  it('has unique slugs, titles, descriptions, and introductions', () => {
    for (const values of [
      SEO_INDUSTRIES.map((item) => item.slug),
      SEO_INDUSTRIES.map((item) => item.title),
      SEO_INDUSTRIES.map((item) => item.description),
      SEO_INDUSTRIES.map((item) => item.intro),
    ]) {
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it.each(SEO_INDUSTRIES)('$slug has substantial trade-specific content', (industry) => {
    expect(industry.intro.length).toBeGreaterThan(180)
    expect(industry.painPoints.length).toBeGreaterThanOrEqual(3)
    expect(industry.outcomes.length).toBeGreaterThanOrEqual(3)
    expect(industry.projectExamples.length).toBeGreaterThanOrEqual(4)
    expect(industry.faqs.length).toBeGreaterThanOrEqual(3)
    expect(getSeoIndustry(industry.slug)).toBe(industry)
  })

  it('does not expose arbitrary slugs', () => {
    expect(getSeoIndustry('miami-cheap-roof-estimates')).toBeUndefined()
  })
})
