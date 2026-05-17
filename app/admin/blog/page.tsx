import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import type { BlogPost } from '@/lib/queries/blog'
import { BlogPostActions } from './blog-post-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function AdminBlogPage() {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data } = await svc
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false })

  const posts = (data ?? []) as BlogPost[]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Blog posts</h1>
          <p className="text-sm text-muted-foreground">
            Manage blog posts for the public /blog feed.
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/admin/blog/new">New post</Link>
        </Button>
      </div>

      <Card variant="glass" className="p-0 overflow-hidden">
        {posts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No posts yet. Create your first blog post.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-[var(--glass-border)] last:border-0 transition-colors hover:bg-[var(--glass-bg-light)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/blog/${post.id}`}
                      className="font-medium hover:underline"
                    >
                      {post.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {post.status === 'published' ? (
                      <Badge variant="success">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {post.published_at
                      ? new Date(post.published_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <BlogPostActions id={post.id} status={post.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
