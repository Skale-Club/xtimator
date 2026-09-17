import type { Metadata } from 'next'

import { PostList } from '@/components/blog/post-list'
import { getBlogArchive, getBlogPosts, getBlogTags } from '@/lib/queries/blog'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300
export const metadata: Metadata = createPublicMetadata({
  title: 'Estimating Guides for Service Businesses',
  description:
    'Practical estimating, pricing, and proposal guidance for contractors and field service businesses.',
  pathname: '/blog',
})

export default async function BlogListPage() {
  const [posts, archive, tags] = await Promise.all([
    getBlogPosts(0),
    getBlogArchive(),
    getBlogTags(),
  ])

  return <PostList heading="Blog" posts={posts} archive={archive} tags={tags} />
}
