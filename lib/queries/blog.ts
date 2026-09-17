import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

const PAGE_SIZE = 10

export type BlogPostSummary = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string
  tags?: string | null
  author_name?: string | null
}

export type ArchiveEntry = { year: number; month: number; count: number }

export type BlogPost = BlogPostSummary & {
  content: string
  meta_title: string | null
  meta_description: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

// Public blog reads use the cookieless service-role client (same pattern as
// lib/platform-config.ts) so pages can be statically generated / ISR-cached
// instead of forcing per-request dynamic rendering via the cookie-based client.
//
// RLS note: the service-role key BYPASSES RLS, so the `blog_posts_public_read`
// policy (`status = 'published'`) is NOT enforced automatically here. Every
// query below therefore filters `status = 'published'` explicitly — that filter
// is the security boundary that keeps drafts out of the public pages. Never
// remove it. createServiceClient() returns null when the env vars are absent
// (e.g. the static build phase, where the secret key isn't provided as a build
// arg); callers degrade gracefully to empty results and revalidate on-demand at
// runtime, matching getBranding()'s fallback behaviour.

export async function getBlogPosts(page = 0, pageSize = PAGE_SIZE): Promise<BlogPostSummary[]> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return data ?? []
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return (data as BlogPost | null) ?? null
}

/**
 * Published slugs for generateStaticParams(), newest first and capped so build
 * time stays bounded. Returns [] when the service client is unavailable (static
 * build phase without the secret key) — unknown/new slugs still render on-demand
 * via the route's default dynamicParams behaviour.
 */
export async function getPublishedSlugs(limit = 100): Promise<string[]> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((row) => row.slug as string)
}


// ─── Etiquetas, autor e arquivos ─────────────────────────────────────────────
//
// O `status = 'published'` continua a ser a fronteira de segurança em TODAS as
// consultas abaixo, pela razão descrita acima: a chave de serviço ignora a RLS.

const SUMMARY_FIELDS =
  'id, title, slug, excerpt, cover_image_url, published_at, updated_at, tags, author_name'

/** `tags` é texto separado por vírgulas. Divide e normaliza. */
export function parseTags(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** `Cuidados com Metal` → `cuidados-com-metal`, para o URL. */
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Todas as etiquetas em uso, com contagem.
 *
 * Lidas dos posts e não de uma tabela própria porque é assim que estão
 * guardadas neste repo — uma tabela nova seria um schema a mudar numa base de
 * dados de produção para uma página de listagem.
 */
export async function getBlogTags(): Promise<Array<{ slug: string; name: string; count: number }>> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc.from('blog_posts').select('tags').eq('status', 'published')

  const counts = new Map<string, { name: string; count: number }>()
  for (const row of data ?? []) {
    for (const tag of parseTags((row as { tags: string | null }).tags)) {
      const slug = tagSlug(tag)
      if (!slug) continue
      const entry = counts.get(slug) ?? { name: tag, count: 0 }
      entry.count += 1
      counts.set(slug, entry)
    }
  }

  return Array.from(counts.entries())
    .map(([slug, v]) => ({ slug, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Os posts de uma etiqueta.
 *
 * A correspondência é EXATA, sobre a lista dividida, e acontece em memória. Um
 * `ilike '%art%'` no servidor seria mais barato e estaria errado: devolveria os
 * posts de "artisan" para a etiqueta "art" — uma listagem que promete uma coisa
 * e mostra outra. `tags` é uma coluna de texto, sem índice que sirva para isto,
 * portanto a alternativa correta no servidor seria mudar o schema de uma base
 * de dados em produção para uma página de listagem.
 */
export async function getBlogPostsByTag(slug: string): Promise<BlogPostSummary[]> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('blog_posts')
    .select(SUMMARY_FIELDS)
    .eq('status', 'published')
    .not('tags', 'is', null)
    .order('published_at', { ascending: false })

  return ((data ?? []) as BlogPostSummary[]).filter((post) =>
    parseTags(post.tags).some((tag) => tagSlug(tag) === slug)
  )
}

/** Os posts de um autor, comparado pelo slug derivado do nome. */
export async function getBlogPostsByAuthor(slug: string): Promise<BlogPostSummary[]> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('blog_posts')
    .select(SUMMARY_FIELDS)
    .eq('status', 'published')
    .not('author_name', 'is', null)
    .order('published_at', { ascending: false })

  return ((data ?? []) as BlogPostSummary[]).filter(
    (post) => tagSlug(post.author_name ?? '') === slug
  )
}

/**
 * Quantos posts publicados por ano e por mês.
 *
 * É o que deixa um arquivo vazio dar 404 em vez de renderizar uma página vazia:
 * os anos e os meses são combinatórios, e sem esta lista cada número escrito no
 * URL viraria uma página indexável sem nada dentro.
 *
 * Agrupa em UTC. Um post de dia 1 às 00:30 cairia no mês anterior numa máquina
 * a oeste de Greenwich, e a máquina muda.
 */
export async function getBlogArchive(): Promise<ArchiveEntry[]> {
  const svc = createServiceClient()
  if (!svc) return []
  const { data } = await svc
    .from('blog_posts')
    .select('published_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const raw = (row as { published_at: string | null }).published_at
    if (!raw) continue
    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) continue
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [year, month] = key.split('-').map(Number)
      return { year, month, count }
    })
    .sort((a, b) => b.year - a.year || b.month - a.month)
}

/**
 * Os posts de um ano, ou de um mês desse ano.
 *
 * O limite superior é o fim do período OU AGORA, o que vier primeiro. Sem isso,
 * um post agendado apareceria no arquivo do mês corrente enquanto a contagem
 * acima, que tem a guarda, dizia outro número.
 */
export async function getBlogPostsByMonth(
  year: number,
  month?: number
): Promise<BlogPostSummary[]> {
  const svc = createServiceClient()
  if (!svc) return []

  const from = new Date(Date.UTC(year, month ? month - 1 : 0, 1))
  const periodEnd = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1))
  const now = new Date()
  const to = periodEnd.getTime() < now.getTime() ? periodEnd : now

  const { data } = await svc
    .from('blog_posts')
    .select(SUMMARY_FIELDS)
    .eq('status', 'published')
    .gte('published_at', from.toISOString())
    .lt('published_at', to.toISOString())
    .order('published_at', { ascending: false })

  return (data ?? []) as BlogPostSummary[]
}
