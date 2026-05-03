import { describe, it, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
describe('blog_posts RLS — public visibility (BLOG-02)', () => {
  it.todo('anon client returns only published posts from blog_posts')
  it.todo('anon client returns empty array when all posts are drafts')
  it.todo('getBlogPost returns null for a draft post slug via anon client')
  it.todo('getBlogPost returns post object for a published post slug via anon client')
})
