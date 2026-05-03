import { describe, it, vi } from 'vitest'
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
describe('blog server actions (BLOG-01)', () => {
  it.todo('createPost inserts blog_posts row with correct slug derived from title')
  it.todo('createPost sets published_at when status is published')
  it.todo('updatePost updates title, content, slug, status fields')
  it.todo('deletePost removes the blog_posts row by id')
  it.todo('togglePostStatus sets status=published and published_at when toggling to published')
  it.todo('togglePostStatus sets status=draft and clears published_at when toggling to draft')
  it.todo('createPost returns ok:false when slug already exists')
})
