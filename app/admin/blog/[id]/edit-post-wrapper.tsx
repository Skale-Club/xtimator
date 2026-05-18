'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PostForm } from '../post-form'
import { updatePost } from '../actions'
import type { BlogPost } from '@/lib/queries/blog'
import type { BlogPostInput } from '@/lib/schemas/admin'
import { useTranslation } from '@/lib/i18n/use-translation'

export function EditPostWrapper({ post }: { post: BlogPost }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useTranslation()
  async function handleSave(data: BlogPostInput) {
    startTransition(async () => {
      const result = await updatePost(post.id, data)
      if (result.ok) {
        toast.success(t('Post updated.'))
        router.push('/admin/blog')
      } else {
        toast.error(result.message)
      }
    })
  }
  return <PostForm initial={post} onSave={handleSave} isPending={isPending} />
}
