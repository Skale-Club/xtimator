import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLegalPage } from '@/lib/queries/legal-pages'
import { BlogContent } from '@/components/blog/blog-content'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const page = await getLegalPage('terms_of_service')
  return {
    title: page?.title ?? 'Terms of Service',
    description: 'The terms governing your use of Xtimator.',
  }
}

export default async function TermsOfServicePage() {
  const page = await getLegalPage('terms_of_service')
  if (!page) notFound()

  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] gradient-hero" />
      <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
        <article>
          <header className="mb-10">
            <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em] mb-4">
              {page.title}
            </h1>
            {page.effective_date && (
              <p className="text-sm text-muted-foreground">
                Effective date:{' '}
                <time dateTime={page.effective_date}>
                  {new Date(page.effective_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </p>
            )}
          </header>
          <Card variant="glass" className="p-8 sm:p-10">
            <BlogContent markdown={page.content} />
          </Card>
        </article>
      </main>
    </div>
  )
}
