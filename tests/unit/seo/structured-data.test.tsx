import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JsonLd } from '@/components/seo/json-ld'
import {
  articleSchema,
  breadcrumbSchema,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data'

describe('structured data', () => {
  it('builds acquisition schemas with stable canonical IDs', () => {
    expect(organizationSchema({ name: 'Xtimator', description: 'AI estimates' })).toEqual(
      expect.objectContaining({ '@type': 'Organization', url: 'https://xtimator.com/' }),
    )
    expect(websiteSchema('Xtimator')).toEqual(expect.objectContaining({ '@type': 'WebSite' }))
    expect(softwareApplicationSchema({ name: 'Xtimator', description: 'AI estimates' })).toEqual(
      expect.objectContaining({ applicationCategory: 'BusinessApplication' }),
    )
  })

  it('uses real article dates and breadcrumb positions', () => {
    const article = articleSchema({
      title: 'Guide',
      description: 'Description',
      slug: 'guide',
      publishedAt: '2026-07-01',
      updatedAt: '2026-07-02',
    })
    expect(article).toEqual(
      expect.objectContaining({ datePublished: '2026-07-01', dateModified: '2026-07-02' }),
    )
    const crumbs = breadcrumbSchema([
      { name: 'Home', pathname: '/' },
      { name: 'Guide', pathname: '/blog/guide' },
    ])
    expect(crumbs.itemListElement[1].position).toBe(2)
  })

  it('renders parseable JSON and escapes markup', () => {
    const { container } = render(<JsonLd data={{ name: '</script><script>alert(1)</script>' }} />)
    const script = container.querySelector('script')
    expect(script?.textContent).toContain('\\u003c/script>')
    expect(() => JSON.parse(script?.textContent ?? '')).not.toThrow()
  })
})
