'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PostForm } from './post-form'
import { createPost } from './actions'
import type { BlogPostInput } from '@/lib/schemas/admin'

export function PostFormWrapper() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  async function handleSave(data: BlogPostInput) {
    startTransition(async () => {
      const result = await createPost(data)
      if (result.ok) {
        toast.success('Post created.')
        router.push('/admin/blog')
      } else {
        toast.error(result.message)
      }
    })
  }
  return <PostForm onSave={handleSave} isPending={isPending} />
}
