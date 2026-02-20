import { MetadataRoute } from 'next'
import { SITEMAP_ROUTES } from '@/lib/sitemap-config'
import { businessTemplates } from '@/lib/service-templates'
import { getBaseUrl, getCurrentDate } from '@/lib/sitemap-utils'

/**
 * Dynamic sitemap for Xtimator
 * 
 * This sitemap is automatically generated and updates with each build.
 * It includes:
 * - Static application routes (dashboard, estimates, customers, etc.)
 * - Dynamic routes for each business template type
 * - Dynamic routes for service categories
 * 
 * Since this is an SPA with state-based routing, we use anchors (#)
 * for the different application views.
 * 
 * Access at: /sitemap.xml
 * 
 * To add new routes:
 * - Edit the file lib/sitemap-config.ts for static routes
 * - Add business templates in lib/service-templates.ts for dynamic routes
 * 
 * To force update:
 * - In production: redeploy the application
 * - In dev: restart the server (Ctrl+C and bun dev)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl()
  const currentDate = getCurrentDate()

  // Static routes from configuration
  const staticRoutes = SITEMAP_ROUTES.map(route => ({
    url: `${baseUrl}${route.path}`,
    lastModified: route.lastModified || currentDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  // Dynamic routes for business templates
  const templateRoutes = businessTemplates
    .filter(template => template.id !== 'custom') // Exclude custom template
    .map(template => ({
      url: `${baseUrl}/#services?template=${template.id}`,
      lastModified: currentDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))

  // Dynamic routes for service categories within each template
  const categoryRoutes = businessTemplates
    .filter(template => template.id !== 'custom')
    .flatMap(template => 
      template.categories.map((category, index) => ({
        url: `${baseUrl}/#services?template=${template.id}&category=${index}`,
        lastModified: currentDate,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }))
    )

  // Combine all routes
  return [
    ...staticRoutes,
    ...templateRoutes,
    ...categoryRoutes,
  ]
}
