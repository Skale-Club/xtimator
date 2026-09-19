import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PostList, monthName } from '@/components/blog/post-list'
import { getBlogArchive, getBlogPostsByMonth, getBlogTags } from '@/lib/queries/blog'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

type Props = { params: Promise<{ year: string; month: string }> }

function parseYearMonth(rawYear: string, rawMonth: string): { year: number; month: number } | null {
  const year = Number(rawYear)
  const month = Number(rawMonth)
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year: rawYear, month: rawMonth } = await params
  const parsed = parseYearMonth(rawYear, rawMonth)
  if (!parsed) return {}

  // O caminho canónico leva o mês com dois dígitos, sempre. /2026/3 e /2026/03
  // responderiam os dois, e o mesmo arquivo teria dois URLs indexáveis.
  const pathname = `/blog/archive/${parsed.year}/${String(parsed.month).padStart(2, '0')}`
  const label = `${monthName(parsed.month)} ${parsed.year}`
  return createPublicMetadata({
    title: `Archive: ${label}`,
    description: `Everything published in ${label}.`,
    pathname,
  })
}

export default async function BlogMonthArchivePage({ params }: Props) {
  const { year: rawYear, month: rawMonth } = await params
  const parsed = parseYearMonth(rawYear, rawMonth)
  if (!parsed) notFound()

  const archive = await getBlogArchive()
  if (!archive.some((e) => e.year === parsed.year && e.month === parsed.month)) notFound()

  const [posts, tags] = await Promise.all([
    getBlogPostsByMonth(parsed.year, parsed.month),
    getBlogTags(),
  ])
  if (posts.length === 0) notFound()

  return (
    <PostList
      heading={`${monthName(parsed.month)} ${parsed.year}`}
      posts={posts}
      archive={archive}
      tags={tags}
    />
  )
}
