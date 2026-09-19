import type { MetadataRoute } from 'next'
import { getBlogArchive, getBlogPosts, getBlogTags } from '@/lib/queries/blog'
import { canonicalUrl } from '@/lib/seo/metadata'
import { PUBLIC_STATIC_ROUTES } from '@/lib/seo/route-policy'
import { SEO_INDUSTRIES } from '@/lib/seo/industries'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, archive, tags] = await Promise.all([
    getBlogPosts(0, 1000),
    getBlogArchive(),
    getBlogTags(),
  ])
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_STATIC_ROUTES.map((pathname) => ({
    url: canonicalUrl(pathname),
    changeFrequency: pathname === '/' || pathname === '/blog' ? 'weekly' : 'yearly',
    priority: pathname === '/' ? 1 : pathname === '/blog' ? 0.8 : 0.3,
  }))

  return [
    ...staticEntries,
    ...SEO_INDUSTRIES.map((industry) => ({
      url: canonicalUrl(`/industries/${industry.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...posts.map((post) => ({
      url: canonicalUrl(`/blog/${post.slug}`),
      lastModified: post.updated_at ?? post.published_at ?? undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...tags.map((tag) => ({
      url: canonicalUrl(`/blog/tag/${tag.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    // Só os arquivos que EXISTEM — a lista vem da contagem, não de um ciclo de
    // 1 a 12. O sitemap não pode prometer páginas que respondem 404.
    ...Array.from(new Set(archive.map((entry) => entry.year))).map((year) => ({
      url: canonicalUrl(`/blog/archive/${year}`),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
    ...archive.map((entry) => ({
      url: canonicalUrl(
        `/blog/archive/${entry.year}/${String(entry.month).padStart(2, '0')}`
      ),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ]
}
