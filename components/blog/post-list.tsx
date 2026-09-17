import Image from 'next/image'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import type { ArchiveEntry, BlogPostSummary } from '@/lib/queries/blog'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month)
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Um post numa listagem: título, excerto, data e etiquetas — NUNCA o conteúdo.
 *
 * Não é peso: um arquivo mensal com um post só, a mostrar o artigo inteiro,
 * duplica a página canónica desse artigo. As consultas já não trazem o
 * `content`; isto garante que nenhuma vista o mostraria se trouxesse.
 */
export function PostCard({ post }: { post: BlogPostSummary }) {
  const date = formatDate(post.published_at)

  return (
    <article>
      <Card variant="glass" className="overflow-hidden p-0">
        {post.cover_image_url && (
          <div className="relative h-48 w-full">
            <Image
              src={post.cover_image_url}
              alt={`Cover for ${post.title}`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            <Link href={`/blog/${post.slug}`} className="hover:underline">
              {post.title}
            </Link>
          </h2>
          {post.excerpt && <p className="leading-[1.55] text-muted-foreground">{post.excerpt}</p>}
          {date && (
            <time dateTime={post.published_at ?? undefined} className="text-xs text-muted-foreground">
              {date}
            </time>
          )}
        </div>
      </Card>
    </article>
  )
}

/**
 * A listagem que o índice, as etiquetas, os autores e os arquivos partilham.
 *
 * Um componente só porque as quatro vistas diferem apenas no título e no filtro
 * — quatro cópias seriam quatro sítios onde o cartão ou o aviso de vazio podem
 * divergir sem ninguém reparar.
 */
export function PostList({
  heading,
  lead,
  posts,
  archive = [],
  tags = [],
}: {
  heading: string
  lead?: string | null
  posts: BlogPostSummary[]
  archive?: ArchiveEntry[]
  tags?: Array<{ slug: string; name: string; count: number }>
}) {
  const byYear = new Map<number, ArchiveEntry[]>()
  for (const entry of archive) {
    const list = byYear.get(entry.year) ?? []
    list.push(entry)
    byYear.set(entry.year, list)
  }

  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] gradient-hero" />
      <main className="mx-auto max-w-5xl px-6 py-[clamp(48px,10vw,96px)]">
        <header className="mb-12">
          <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em]">
            {heading}
          </h1>
          {lead && <p className="mt-3 text-muted-foreground">{lead}</p>}
        </header>

        <div className="flex flex-col gap-12 lg:flex-row">
          <div className="flex-1">
            {posts.length === 0 ? (
              <p className="text-muted-foreground">No posts yet.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>

          {(tags.length > 0 || byYear.size > 0) && (
            <aside className="flex w-full flex-col gap-8 lg:w-56 lg:shrink-0">
              {tags.length > 0 && (
                <nav aria-label="Tags" className="flex flex-col gap-2">
                  <h2 className="font-semibold">Tags</h2>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {tags.map((tag) => (
                      <li key={tag.slug}>
                        <Link
                          href={`/blog/tag/${tag.slug}`}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          #{tag.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              {byYear.size > 0 && (
                <nav aria-label="Archive" className="flex flex-col gap-4">
                  <h2 className="font-semibold">Archive</h2>
                  {Array.from(byYear.entries())
                    .sort((a, b) => b[0] - a[0])
                    .map(([year, months]) => (
                      <div key={year} className="flex flex-col gap-1">
                        <Link href={`/blog/archive/${year}`} className="font-medium hover:underline">
                          {year}
                        </Link>
                        <ul className="flex flex-col gap-0.5 pl-3">
                          {months
                            .sort((a, b) => b.month - a.month)
                            .map((entry) => (
                              <li key={entry.month}>
                                <Link
                                  href={`/blog/archive/${entry.year}/${String(entry.month).padStart(2, '0')}`}
                                  className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                  {monthName(entry.month)}{' '}
                                  <span className="opacity-60">({entry.count})</span>
                                </Link>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </nav>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}
