import type { Metadata } from 'next'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'

export const DEFAULT_SOCIAL_IMAGE = { width: 1200, height: 630 } as const
const MAX_DESCRIPTION_LENGTH = 160

export function conciseDescription(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= MAX_DESCRIPTION_LENGTH) return normalized
  return `${normalized.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
}

export function canonicalUrl(pathname = '/'): string {
  return new URL(pathname, `${getCanonicalBaseUrl()}/`).toString()
}

type PublicMetadataInput = {
  title: string
  description: string
  pathname: string
  siteName?: string
  imageUrl?: string | null
  imageAlt?: string
  type?: 'website' | 'article'
}

export function createPublicMetadata({
  title,
  description,
  pathname,
  siteName = 'Xtimator',
  imageUrl,
  imageAlt = `${siteName} — AI estimating software for service businesses`,
  type = 'website',
}: PublicMetadataInput): Metadata {
  const url = canonicalUrl(pathname)
  const concise = conciseDescription(description)
  const images = imageUrl
    ? [{ url: imageUrl, ...DEFAULT_SOCIAL_IMAGE, alt: imageAlt }]
    : undefined

  return {
    title,
    description: concise,
    alternates: { canonical: url },
    openGraph: { title, description: concise, url, type, siteName, locale: 'en_US', images },
    twitter: {
      card: 'summary_large_image',
      title,
      description: concise,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}
