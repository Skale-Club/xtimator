import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/queries/blog', () => ({
  getBlogPosts: vi.fn().mockResolvedValue([
    {
      id: 'post-1',
      title: 'Estimating guide',
      slug: 'estimating-guide',
      excerpt: 'Guide',
      cover_image_url: null,
      published_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    },
  ]),
}))

describe('SEO metadata routes', () => {
  it('robots points to the canonical sitemap and disallows private prefixes', async () => {
    const { default: robots } = await import('@/app/robots')
    const result = robots()
    expect(result.sitemap).toBe('https://xtimator.com/sitemap.xml')
    expect(result.host).toBe('https://xtimator.com/')
    expect(result.rules).toEqual(
      expect.objectContaining({
        disallow: expect.arrayContaining(['/admin/', '/api/', '/estimate/', '/settings/']),
      }),
    )
  })

  it('sitemap includes public and published URLs but no private routes', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const result = await sitemap()
    const urls = result.map((entry) => entry.url)
    expect(urls).toContain('https://xtimator.com/')
    expect(urls).toContain('https://xtimator.com/blog/estimating-guide')
    expect(urls.every((url) => !/\/(admin|api|demo|estimate|settings)(\/|$)/.test(url))).toBe(true)
  })
})
