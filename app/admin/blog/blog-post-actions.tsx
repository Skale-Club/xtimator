'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { togglePostStatus, deletePost } from './actions'

type BlogPostActionsProps = {
  id: string
  status: 'draft' | 'published'
}

export function BlogPostActions({ id, status }: BlogPostActionsProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleToggle() {
    startTransition(async () => {
      const result = await togglePostStatus(id, status)
      if (result.ok) {
        toast.success(status === 'draft' ? 'Post published.' : 'Post moved to draft.')
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function handleDelete() {
    if (!confirm('Delete this post? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deletePost(id)
      if (result.ok) {
        toast.success('Post deleted.')
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {status === 'draft' ? 'Publish' : 'Unpublish'}
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  )
}
