/**
 * Sitemap routes configuration
 * 
 * This file centralizes the definition of all routes that should
 * appear in the application's sitemap.xml.
 * 
 * To add a new route to the sitemap:
 * 1. Add a new object to the SITEMAP_ROUTES array
 * 2. Configure priority (0.0 to 1.0) and change frequency
 * 3. The sitemap will be automatically updated on the next build
 * 
 * Priority guidelines:
 * - 1.0: Homepage and most critical pages
 * - 0.8-0.9: Main feature pages (estimates, customers)
 * - 0.6-0.7: Secondary pages (services, settings)
 * - 0.4-0.5: Tertiary pages (specific categories, filters)
 * 
 * Change frequency guidelines:
 * - always: Pages that change with every access
 * - hourly: Real-time data pages
 * - daily: Frequently updated content
 * - weekly: Regularly updated features
 * - monthly: Stable features
 * - yearly: Static content
 * - never: Archived content
 */

export interface SitemapRoute {
  /** Route path (e.g., '/', '/#estimates') */
  path: string
  /** Page priority (0.0 to 1.0) */
  priority: number
  /** Expected change frequency */
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Last modified date (optional, uses current date if not specified) */
  lastModified?: Date
  /** Optional description for documentation purposes */
  description?: string
}

/**
 * Sitemap routes
 * 
 * Ordered by priority (most important first)
 */
export const SITEMAP_ROUTES: SitemapRoute[] = [
  {
    path: '/',
    priority: 1.0,
    changeFrequency: 'daily',
    description: 'Homepage / Dashboard - Main entry point',
  },
  {
    path: '/#dashboard',
    priority: 1.0,
    changeFrequency: 'daily',
    description: 'Dashboard view with business metrics',
  },
  {
    path: '/#estimates',
    priority: 0.9,
    changeFrequency: 'daily',
    description: 'Estimates list and management',
  },
  {
    path: '/#new-estimate',
    priority: 0.9,
    changeFrequency: 'weekly',
    description: 'Create new estimate flow',
  },
  {
    path: '/#customers',
    priority: 0.8,
    changeFrequency: 'weekly',
    description: 'Customer management',
  },
  {
    path: '/#services',
    priority: 0.7,
    changeFrequency: 'monthly',
    description: 'Service catalog and pricing',
  },
  {
    path: '/#settings',
    priority: 0.6,
    changeFrequency: 'monthly',
    description: 'Application settings and configuration',
  },
  // Filter views
  {
    path: '/#estimates?filter=draft',
    priority: 0.7,
    changeFrequency: 'daily',
    description: 'Draft estimates',
  },
  {
    path: '/#estimates?filter=sent',
    priority: 0.7,
    changeFrequency: 'daily',
    description: 'Sent estimates',
  },
  {
    path: '/#estimates?filter=accepted',
    priority: 0.7,
    changeFrequency: 'daily',
    description: 'Accepted estimates',
  },
]
