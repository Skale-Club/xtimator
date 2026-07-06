import type { MetadataRoute } from 'next'
import { getBlogPosts } from '@/lib/queries/blog'
import { canonicalUrl } from '@/lib/seo/metadata'
import { PUBLIC_STATIC_ROUTES } from '@/lib/seo/route-policy'
import { SEO_INDUSTRIES } from '@/lib/seo/industries'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts(0, 1000)
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
  ]
}
