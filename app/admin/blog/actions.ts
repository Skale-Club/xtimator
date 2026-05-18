'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { blogPostSchema, type BlogPostInput } from '@/lib/schemas/admin'

export type BlogActionResult = { ok: true } | { ok: false; message: string }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function createPost(data: BlogPostInput): Promise<BlogActionResult> {
  const ctx = await requireAdmin()
  const parsed = blogPostSchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  const svc = requireServiceClient()
  const now = new Date().toISOString()
  const finalSlug = parsed.data.slug || slugify(parsed.data.title)
  const { error } = await svc.from('blog_posts').insert({
    title: parsed.data.title,
    slug: finalSlug,
    content: parsed.data.content,
    excerpt: parsed.data.excerpt,
    cover_image_url: parsed.data.coverImageUrl,
    status: parsed.data.status,
    published_at: parsed.data.status === 'published' ? now : null,
    meta_title: parsed.data.metaTitle,
    meta_description: parsed.data.metaDescription,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Slug already in use.' }
    return { ok: false, message: error.message }
  }
  revalidatePath('/admin/blog')
  revalidatePath('/blog')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'blog.create',
    targetType: 'blog_post',
    targetId: finalSlug,
    metadata: { status: parsed.data.status },
  })

  return { ok: true }
}

export async function updatePost(id: string, data: BlogPostInput): Promise<BlogActionResult> {
  const ctx = await requireAdmin()
  const parsed = blogPostSchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  const svc = requireServiceClient()
  const { data: existing } = await svc.from('blog_posts').select('published_at, status').eq('id', id).single()
  const now = new Date().toISOString()
  const publishedAt = parsed.data.status === 'published' ? (existing?.published_at ?? now) : null
  const { error } = await svc.from('blog_posts').update({
    title: parsed.data.title,
    slug: parsed.data.slug,
    content: parsed.data.content,
    excerpt: parsed.data.excerpt,
    cover_image_url: parsed.data.coverImageUrl,
    status: parsed.data.status,
    published_at: publishedAt,
    meta_title: parsed.data.metaTitle,
    meta_description: parsed.data.metaDescription,
    updated_at: now,
  }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
  if (existing?.status === 'published' || parsed.data.status === 'published') {
    revalidatePath(`/blog/${parsed.data.slug}`)
  }

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'blog.update',
    targetType: 'blog_post',
    targetId: parsed.data.slug,
    metadata: {
      status: parsed.data.status,
      previous_status: existing?.status ?? null,
    },
  })

  return { ok: true }
}

export async function deletePost(id: string): Promise<BlogActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  // Capture the slug before deletion so the audit row references it (not the UUID).
  const { data: existing } = await svc
    .from('blog_posts')
    .select('slug')
    .eq('id', id)
    .maybeSingle()
  const { error } = await svc.from('blog_posts').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/blog')
  revalidatePath('/blog')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'blog.delete',
    targetType: 'blog_post',
    targetId: existing?.slug ?? id,
  })

  return { ok: true }
}

export async function togglePostStatus(id: string, currentStatus: 'draft' | 'published'): Promise<BlogActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  const newStatus = currentStatus === 'draft' ? 'published' : 'draft'
  const now = new Date().toISOString()
  // Capture slug for the audit row.
  const { data: existing } = await svc
    .from('blog_posts')
    .select('slug')
    .eq('id', id)
    .maybeSingle()
  const { error } = await svc.from('blog_posts').update({
    status: newStatus,
    published_at: newStatus === 'published' ? now : null,
    updated_at: now,
  }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/blog')
  revalidatePath('/blog')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'blog.publish',
    targetType: 'blog_post',
    targetId: existing?.slug ?? id,
    metadata: { new_status: newStatus, previous_status: currentStatus },
  })

  return { ok: true }
}
