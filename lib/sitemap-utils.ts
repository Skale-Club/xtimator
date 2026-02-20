/**
 * Sitemap URL utilities
 * 
 * Helper functions for generating consistent sitemap URLs
 * and managing sitemap-related functionality.
 */

/**
 * Get the base URL for the application
 * Falls back to localhost in development
 */
export function getBaseUrl(): string {
  // Check environment variable first
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // Vercel deployment URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Fallback to localhost
  return 'http://localhost:3000'
}

/**
 * Generate a full URL for a given path
 * @param path - The path to append to the base URL (e.g., '/about', '/#services')
 */
export function generateUrl(path: string): string {
  const baseUrl = getBaseUrl()
  // Remove trailing slash from base URL if present
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBaseUrl}${cleanPath}`
}

/**
 * Generate a hash-based route URL for SPA navigation
 * @param view - The view name (e.g., 'estimates', 'customers')
 * @param params - Optional query parameters
 */
export function generateViewUrl(
  view: string,
  params?: Record<string, string | number>
): string {
  let path = `/#${view}`
  
  if (params && Object.keys(params).length > 0) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')
    path += `?${queryString}`
  }
  
  return generateUrl(path)
}

/**
 * Check if the application is running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Get the current date for sitemap lastModified
 */
export function getCurrentDate(): Date {
  return new Date()
}
