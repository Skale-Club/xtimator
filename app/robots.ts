import { MetadataRoute } from 'next'
import { getBaseUrl, isProduction } from '@/lib/sitemap-utils'

/**
 * Dynamic robots.txt for Xtimator
 * 
 * This file generates the robots.txt dynamically based on the environment.
 * 
 * In production:
 * - Allows all search engines to crawl
 * - Points to the sitemap.xml
 * 
 * In development/preview:
 * - Can be configured to disallow crawling
 * 
 * Access at: /robots.txt
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()
  const isProd = isProduction()

  return {
    rules: {
      userAgent: '*',
      allow: isProd ? '/' : undefined,
      disallow: isProd ? undefined : '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
