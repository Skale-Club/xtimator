import { canonicalUrl } from '@/lib/seo/metadata'

type BrandSchemaInput = {
  name: string
  description: string
  logoUrl?: string | null
}

export function organizationSchema({ name, description, logoUrl }: BrandSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': canonicalUrl('/#organization'),
    name,
    url: canonicalUrl('/'),
    description,
    ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl } } : {}),
  }
}

export function websiteSchema(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': canonicalUrl('/#website'),
    name,
    url: canonicalUrl('/'),
    publisher: { '@id': canonicalUrl('/#organization') },
  }
}

export function softwareApplicationSchema({ name, description }: BrandSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': canonicalUrl('/#software'),
    name,
    description,
    url: canonicalUrl('/'),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free account available',
    },
    publisher: { '@id': canonicalUrl('/#organization') },
  }
}

type ArticleSchemaInput = {
  title: string
  description: string
  slug: string
  publishedAt?: string | null
  updatedAt: string
  imageUrl?: string | null
}

export function articleSchema(input: ArticleSchemaInput) {
  const url = canonicalUrl(`/blog/${input.slug}`)
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: input.title,
    description: input.description,
    mainEntityOfPage: url,
    datePublished: input.publishedAt ?? input.updatedAt,
    dateModified: input.updatedAt,
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    publisher: { '@id': canonicalUrl('/#organization') },
  }
}

export function breadcrumbSchema(items: Array<{ name: string; pathname: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.pathname),
    })),
  }
}

export function faqPageSchema(items: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}
