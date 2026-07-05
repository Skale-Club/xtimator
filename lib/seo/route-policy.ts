import type { Metadata } from 'next'

export const PRIVATE_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false, noimageindex: true },
}

export const PUBLIC_STATIC_ROUTES = [
  '/',
  '/blog',
  '/privacy-policy',
  '/terms-of-service',
] as const

export const PRIVATE_ROUTE_PREFIXES = [
  '/admin', '/api', '/callback', '/capture', '/chat', '/clients', '/dashboard',
  '/demo', '/estimate', '/invite', '/notifications', '/oauth', '/offline',
  '/onboarding', '/price-book', '/projects', '/settings', '/update-password',
  '/whatsapp',
] as const

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
