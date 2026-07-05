import type { MetadataRoute } from 'next'
import { canonicalUrl } from '@/lib/seo/metadata'
import { PRIVATE_ROUTE_PREFIXES } from '@/lib/seo/route-policy'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE_ROUTE_PREFIXES.map((prefix) => `${prefix}/`),
    },
    sitemap: canonicalUrl('/sitemap.xml'),
    host: canonicalUrl('/'),
  }
}
