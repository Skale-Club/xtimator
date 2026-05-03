import { getBlogPosts } from '@/lib/queries/blog'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function BlogListPage() {
  const posts = await getBlogPosts(0)
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-10">Blog</h1>
      {posts.length === 0 && <p className="text-muted-foreground">No posts yet.</p>}
      <div className="flex flex-col gap-8">
        {posts.map(post => (
          <article key={post.id} className="flex flex-col gap-2">
            {post.cover_image_url && (
              <img src={post.cover_image_url} alt="" className="rounded-xl w-full h-48 object-cover" />
            )}
            <h2 className="text-xl font-semibold">
              <Link href={`/blog/${post.slug}`} className="hover:underline">{post.title}</Link>
            </h2>
            {post.excerpt && <p className="text-muted-foreground">{post.excerpt}</p>}
            {post.published_at && (
              <time className="text-xs text-muted-foreground">
                {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
            )}
          </article>
        ))}
      </div>
    </main>
  )
}
