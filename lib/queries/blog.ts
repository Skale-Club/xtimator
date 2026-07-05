import 'server-only'
import { createClient } from '@/lib/supabase/server'

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

export async function getBlogPosts(page = 0, pageSize = PAGE_SIZE): Promise<BlogPostSummary[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  return data ?? []
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  return (data as BlogPost | null) ?? null
}
