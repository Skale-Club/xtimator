import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PostList } from '@/components/blog/post-list'
import { getBlogArchive, getBlogPostsByMonth, getBlogTags } from '@/lib/queries/blog'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

type Props = { params: Promise<{ year: string }> }

/**
 * Estreito de propósito: `/blog/archive/99999` e `/blog/archive/abc` são ambos
 * URLs que qualquer pessoa escreve, e um intervalo de datas inválido devolve o
 * blog inteiro sob um URL que promete um ano.
 */
function parseYear(raw: string): number | null {
  const year = Number(raw)
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null
  return year
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseYear((await params).year)
  if (!year) return {}
  return createPublicMetadata({
    title: `Archive: ${year}`,
    description: `Everything published in ${year}.`,
    pathname: `/blog/archive/${year}`,
  })
}

export default async function BlogYearArchivePage({ params }: Props) {
  const year = parseYear((await params).year)
  if (!year) notFound()

  // A contagem decide: um ano sem posts é 404, não uma página vazia. Os anos e
  // os meses são combinatórios — sem isto, cada número escrito no URL vira uma
  // página indexável sem nada dentro.
  const archive = await getBlogArchive()
  if (!archive.some((entry) => entry.year === year)) notFound()

  const [posts, tags] = await Promise.all([getBlogPostsByMonth(year), getBlogTags()])
  if (posts.length === 0) notFound()

  return <PostList heading={String(year)} posts={posts} archive={archive} tags={tags} />
}
