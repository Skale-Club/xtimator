import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Tests for lib/queries/blog.ts — RLS behavior (BLOG-02).
 *
 * Strategy:
 *   - Mock @/lib/supabase/server to return a controlled query chain
 *   - Verify getBlogPosts() only returns published posts
 *   - Verify getBlogPost() returns null when the row is a draft (RLS behavior)
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// blog.ts has 'server-only' — stub it so vitest can import the module
vi.mock('server-only', () => ({}))

type QueryChain = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function makeAnonClient(opts: {
  rowsForSelect?: Record<string, unknown>[] | null
  singleResult?: Record<string, unknown> | null
}): { from: ReturnType<typeof vi.fn> } & QueryChain {
  const rows = opts.rowsForSelect !== undefined ? opts.rowsForSelect : []
  const single = opts.singleResult !== undefined ? opts.singleResult : null

  const maybySingle = vi.fn().mockResolvedValue({ data: single })
  const range = vi.fn().mockResolvedValue({ data: rows })
  const order = vi.fn().mockReturnValue({ range })
  const eq = vi.fn().mockReturnValue({ order, maybeSingle: maybySingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })

  return { from, select, eq, order, range, maybeSingle: maybySingle }
}

describe('blog_posts RLS — public visibility (BLOG-02)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('anon client returns only published posts from blog_posts', async () => {
    const serverModule = await import('@/lib/supabase/server')
    const publishedPosts = [
      { id: '1', title: 'Published Post', slug: 'published-post', excerpt: null, cover_image_url: null, published_at: '2025-01-01T00:00:00Z' },
    ]
    const client = makeAnonClient({ rowsForSelect: publishedPosts })
    ;(serverModule.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { getBlogPosts } = await import('@/lib/queries/blog')
    const result = await getBlogPosts(0)

    expect(result).toEqual(publishedPosts)
    expect(client.from).toHaveBeenCalledWith('blog_posts')
    // Verify the eq filter applies 'published' status
    expect(client.eq).toHaveBeenCalledWith('status', 'published')
  })

  it('anon client returns empty array when all posts are drafts', async () => {
    const serverModule = await import('@/lib/supabase/server')
    // RLS would filter out drafts — anon client gets empty array
    const client = makeAnonClient({ rowsForSelect: [] })
    ;(serverModule.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { getBlogPosts } = await import('@/lib/queries/blog')
    const result = await getBlogPosts(0)

    expect(result).toEqual([])
  })

  it('getBlogPost returns null for a draft post slug via anon client', async () => {
    const serverModule = await import('@/lib/supabase/server')
    // RLS blocks drafts — maybeSingle returns null
    const client = makeAnonClient({ singleResult: null })
    ;(serverModule.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { getBlogPost } = await import('@/lib/queries/blog')
    const result = await getBlogPost('draft-post-slug')

    expect(result).toBeNull()
  })

  it('getBlogPost returns post object for a published post slug via anon client', async () => {
    const serverModule = await import('@/lib/supabase/server')
    const publishedPost = {
      id: '2',
      title: 'Live Post',
      slug: 'live-post',
      content: '# Content',
      excerpt: 'A summary',
      cover_image_url: null,
      published_at: '2025-03-15T00:00:00Z',
      status: 'published',
      meta_title: null,
      meta_description: null,
      created_at: '2025-03-10T00:00:00Z',
      updated_at: '2025-03-10T00:00:00Z',
    }
    const client = makeAnonClient({ singleResult: publishedPost })
    ;(serverModule.createClient as ReturnType<typeof vi.fn>).mockResolvedValue(client)

    const { getBlogPost } = await import('@/lib/queries/blog')
    const result = await getBlogPost('live-post')

    expect(result).toEqual(publishedPost)
    expect(client.eq).toHaveBeenCalledWith('slug', 'live-post')
  })
})
