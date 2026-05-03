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
}

export type BlogPost = BlogPostSummary & {
  content: string
  meta_title: string | null
  meta_description: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export async function getBlogPosts(page = 0): Promise<BlogPostSummary[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
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
