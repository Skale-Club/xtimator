import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import type { BlogPost } from '@/lib/queries/blog'
import { EditPostWrapper } from './edit-post-wrapper'

export const dynamic = 'force-dynamic'

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const svc = requireServiceClient()
  const { data } = await svc.from('blog_posts').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit blog post</h1>
      <EditPostWrapper post={data as BlogPost} />
    </div>
  )
}
