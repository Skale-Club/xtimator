import { requireAdmin } from '@/lib/auth/admin-context'
import { PostFormWrapper } from '../post-form-wrapper'

export const dynamic = 'force-dynamic'

export default async function NewPostPage() {
  await requireAdmin()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New blog post</h1>
      <PostFormWrapper />
    </div>
  )
}
