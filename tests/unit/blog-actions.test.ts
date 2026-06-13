import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Tests for app/admin/blog/actions.ts (BLOG-01).
 *
 * Strategy mirrors branding-actions.test.ts:
 *   - vi.mock admin-context, supabase/service, next/cache, schemas/admin
 *   - Re-import action via dynamic import after vi.resetModules() per test
 */

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => {
  // Alias both exports to one spy (product uses requireServiceClient).
  const client = vi.fn()
  return { createServiceClient: client, requireServiceClient: client }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// logAdminAction writes an audit row via the service client; mock it so its insert
// doesn't pollute the blog_posts insert spy (it shares requireServiceClient()).
vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(),
}))

// Local copy of blogPostSchema decoupled from lib/schemas/admin.ts wave timing.
vi.mock('@/lib/schemas/admin', async () => {
  const { z } = await import('zod')
  return {
    blogPostSchema: z.object({
      title: z.string().min(1).max(200),
      slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
      content: z.string().min(1),
      excerpt: z.string().max(500).nullable(),
      coverImageUrl: z.string().url().nullable().or(z.literal('')).transform((v: string | null) => v || null),
      status: z.enum(['draft', 'published']),
      metaTitle: z.string().max(120).nullable(),
      metaDescription: z.string().max(300).nullable(),
    }),
  }
})

type ChainableFrom = {
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function makeClient(opts: {
  insertResponse?: { error: { code?: string; message: string } | null }
  updateResponse?: { error: { message: string } | null }
  deleteResponse?: { error: { message: string } | null }
  selectData?: { published_at: string | null; status: string } | null
}): { from: ReturnType<typeof vi.fn> } & ChainableFrom {
  const insertResp = opts.insertResponse ?? { error: null }
  const updateResp = opts.updateResponse ?? { error: null }
  const deleteResp = opts.deleteResponse ?? { error: null }
  const selectData = opts.selectData !== undefined ? opts.selectData : { published_at: null, status: 'draft' }

  const insert = vi.fn().mockResolvedValue(insertResp)
  const single = vi.fn().mockResolvedValue({ data: selectData })
  // deletePost/togglePostStatus read the slug via .select().eq().maybeSingle();
  // updatePost reads via .select().eq().single(). Support both terminals.
  const maybeSingle = vi.fn().mockResolvedValue({ data: selectData })
  const eq = vi.fn().mockReturnThis()
  const select = vi.fn().mockReturnValue({ eq, single, maybeSingle })
  const updateEq = vi.fn().mockResolvedValue(updateResp)
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const deleteEq = vi.fn().mockResolvedValue(deleteResp)
  const del = vi.fn().mockReturnValue({ eq: deleteEq })

  const from = vi.fn().mockReturnValue({ insert, select, update, delete: del })

  return { from, insert, update, delete: del, select, eq, single }
}

const validPost = {
  title: 'Hello World',
  slug: 'hello-world',
  content: '# Hello',
  excerpt: null,
  coverImageUrl: null,
  status: 'draft' as const,
  metaTitle: null,
  metaDescription: null,
}

describe('blog server actions (BLOG-01)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const adminCtx = await import('@/lib/auth/admin-context')
    ;(adminCtx.requireAdmin as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValue({ userId: 'admin-1', email: 'admin@test' })

    const svc = await import('@/lib/supabase/service')
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createPost inserts blog_posts row with correct slug derived from title', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({})
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { createPost } = await import('@/app/admin/blog/actions')
    const result = await createPost({ ...validPost, title: 'My First Post', slug: 'my-first-post' })

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('blog_posts')
    expect(client.insert).toHaveBeenCalledTimes(1)
    const insertArg = client.insert.mock.calls[0][0]
    expect(insertArg.slug).toBe('my-first-post')
    expect(insertArg.title).toBe('My First Post')
  })

  it('createPost sets published_at when status is published', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({})
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { createPost } = await import('@/app/admin/blog/actions')
    const before = new Date()
    const result = await createPost({ ...validPost, status: 'published' })
    const after = new Date()

    expect(result).toEqual({ ok: true })
    const insertArg = client.insert.mock.calls[0][0]
    expect(insertArg.status).toBe('published')
    expect(insertArg.published_at).not.toBeNull()
    const publishedAt = new Date(insertArg.published_at)
    expect(publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(publishedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('updatePost updates title, content, slug, status fields', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({ selectData: { published_at: null, status: 'draft' } })
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { updatePost } = await import('@/app/admin/blog/actions')
    const result = await updatePost('post-123', {
      ...validPost,
      title: 'Updated Title',
      content: 'New content',
    })

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('blog_posts')
    expect(client.update).toHaveBeenCalledTimes(1)
    const updateArg = client.update.mock.calls[0][0]
    expect(updateArg.title).toBe('Updated Title')
    expect(updateArg.content).toBe('New content')
  })

  it('deletePost removes the blog_posts row by id', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({})
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { deletePost } = await import('@/app/admin/blog/actions')
    const result = await deletePost('post-xyz')

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('blog_posts')
    expect(client.delete).toHaveBeenCalledTimes(1)
  })

  it('togglePostStatus sets status=published and published_at when toggling to published', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({})
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { togglePostStatus } = await import('@/app/admin/blog/actions')
    const before = new Date()
    const result = await togglePostStatus('post-1', 'draft')
    const after = new Date()

    expect(result).toEqual({ ok: true })
    const updateArg = client.update.mock.calls[0][0]
    expect(updateArg.status).toBe('published')
    expect(updateArg.published_at).not.toBeNull()
    const publishedAt = new Date(updateArg.published_at)
    expect(publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(publishedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('togglePostStatus sets status=draft and clears published_at when toggling to draft', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({})
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { togglePostStatus } = await import('@/app/admin/blog/actions')
    const result = await togglePostStatus('post-1', 'published')

    expect(result).toEqual({ ok: true })
    const updateArg = client.update.mock.calls[0][0]
    expect(updateArg.status).toBe('draft')
    expect(updateArg.published_at).toBeNull()
  })

  it('createPost returns ok:false when slug already exists (23505)', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeClient({
      insertResponse: { error: { code: '23505', message: 'duplicate key' } },
    })
    ;(svc.createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { createPost } = await import('@/app/admin/blog/actions')
    const result = await createPost(validPost)

    expect(result).toEqual({ ok: false, message: 'Slug already in use.' })
  })
})
