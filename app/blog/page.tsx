import { getBlogPosts } from '@/lib/queries/blog'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import type { Metadata } from 'next'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300
export const metadata: Metadata = createPublicMetadata({
  title: 'Estimating Guides for Service Businesses',
  description: 'Practical estimating, pricing, and proposal guidance for contractors and field service businesses.',
  pathname: '/blog',
})

export default async function BlogListPage() {
  const posts = await getBlogPosts(0)
  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] gradient-hero" />
      <main className="mx-auto max-w-4xl px-6 py-[clamp(48px,10vw,96px)]">
        <header className="mb-12">
          <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em]">Blog</h1>
        </header>
        {posts.length === 0 && <p className="text-muted-foreground">No posts yet.</p>}
        <div className="flex flex-col gap-8">
          {posts.map(post => (
            <article key={post.id}>
              <Card variant="glass" className="overflow-hidden p-0">
                {post.cover_image_url && (
                  <div className="relative w-full h-48">
                    <Image
                      src={post.cover_image_url}
                      alt={`Cover for ${post.title}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 768px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 p-6">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    <Link href={`/blog/${post.slug}`} className="hover:underline">{post.title}</Link>
                  </h2>
                  {post.excerpt && <p className="text-muted-foreground leading-[1.55]">{post.excerpt}</p>}
                  {post.published_at && (
                    <time dateTime={post.published_at} className="text-xs text-muted-foreground">
                      {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </time>
                  )}
                </div>
              </Card>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
