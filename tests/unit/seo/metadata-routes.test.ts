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
  // O sitemap passou a listar também as etiquetas e os arquivos que EXISTEM.
  // O mock declara-os porque um mock incompleto faria o módulo real ser
  // carregado para as funções em falta — e aí o teste tocaria na base de dados.
  getBlogArchive: vi.fn().mockResolvedValue([{ year: 2026, month: 7, count: 1 }]),
  getBlogTags: vi.fn().mockResolvedValue([{ slug: 'pricing', name: 'Pricing', count: 1 }]),
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
    expect(urls).toContain('https://xtimator.com/blog/tag/pricing')
    // Só os arquivos que existem: o ano e o mês vêm da contagem, nunca de um
    // ciclo de 1 a 12 — o sitemap não pode prometer páginas que dão 404.
    expect(urls).toContain('https://xtimator.com/blog/archive/2026')
    expect(urls).toContain('https://xtimator.com/blog/archive/2026/07')
    expect(urls.filter((url) => url.includes('/blog/archive/'))).toHaveLength(2)
    expect(urls.every((url) => !/\/(admin|api|demo|estimate|settings)(\/|$)/.test(url))).toBe(true)
  })
})
