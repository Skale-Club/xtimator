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
}

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
