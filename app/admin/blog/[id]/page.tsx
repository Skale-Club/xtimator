import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import type { BlogPost } from '@/lib/queries/blog'
import { EditPostWrapper } from './edit-post-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const svc = requireServiceClient()
  const { data } = await svc.from('blog_posts').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight"><T>Edit blog post</T></h1>
      <Card variant="glass" className="p-6 md:p-8">
        <EditPostWrapper post={data as BlogPost} />
      </Card>
    </div>
  )
}
