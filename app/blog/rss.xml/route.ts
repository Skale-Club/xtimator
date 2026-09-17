import { getBlogPosts } from '@/lib/queries/blog'

/**
 * O feed do blog.
 *
 * `app/blog/rss.xml/route.ts` resolve para `/blog/rss.xml` e não colide com
 * `/blog/[slug]`: um segmento estático ganha sempre ao dinâmico. Um post cujo
 * slug fosse "rss.xml" ficaria inalcançável — improvável, e o preço de ter o
 * feed no sítio onde as pessoas o procuram.
 */
export const revalidate = 3600

const MAX_ITEMS = 50

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com').replace(/\/+$/, '')
}

export async function GET(): Promise<Response> {
  const posts = await getBlogPosts(0, MAX_ITEMS)
  const base = baseUrl()

  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        // isPermaLink: o URL é estável e é o identificador. Um guid sintético
        // mudaria a cada reconstrução e reapresentaria posts antigos como novos
        // em todos os leitores.
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        post.published_at
          ? `      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>`
          : '',
        post.excerpt ? `      <description>${escapeXml(post.excerpt)}</description>` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Xtimator — Blog</title>',
    `    <link>${escapeXml(`${base}/blog`)}</link>`,
    '    <description>Practical estimating, pricing, and proposal guidance for contractors and field service businesses.</description>',
    `    <atom:link href="${escapeXml(`${base}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
