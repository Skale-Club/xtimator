import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { JsonLd } from '@/components/seo/json-ld'
import { createPublicMetadata } from '@/lib/seo/metadata'
import { getSeoIndustry, SEO_INDUSTRIES } from '@/lib/seo/industries'
import { breadcrumbSchema, faqPageSchema } from '@/lib/seo/structured-data'

type IndustryPageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return SEO_INDUSTRIES.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const industry = getSeoIndustry((await params).slug)
  if (!industry) return { title: 'Industry Not Found', robots: { index: false, follow: false } }
  return createPublicMetadata({
    title: industry.title,
    description: industry.description,
    pathname: `/industries/${industry.slug}`,
  })
}

export default async function IndustryPage({ params }: IndustryPageProps) {
  const industry = getSeoIndustry((await params).slug)
  if (!industry) notFound()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', pathname: '/' },
            { name: 'Industries', pathname: '/industries' },
            { name: industry.name, pathname: `/industries/${industry.slug}` },
          ]),
          faqPageSchema(industry.faqs),
        ]}
      />
      <section className="relative overflow-hidden border-b border-white/5 px-6 py-20 sm:py-28">
        <div aria-hidden className="gradient-hero absolute inset-0 -z-10" />
        <div className="mx-auto max-w-5xl">
          <Link href="/industries" className="text-sm text-muted-foreground transition hover:text-foreground">
            Industries / {industry.name}
          </Link>
          <p className="mt-12 text-sm font-bold uppercase tracking-[0.16em] text-primary">{industry.eyebrow}</p>
          <h1 className="mt-4 max-w-4xl text-[clamp(42px,7vw,76px)] font-semibold leading-[0.98] tracking-[-0.04em]">
            {industry.title}
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground">{industry.intro}</p>
          <Link
            href="/?auth=signup"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            Create your first estimate <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">What slows the quote down</p>
          <ul className="mt-6 space-y-4">
            {industry.painPoints.map((point) => (
              <li key={point} className="border-l border-white/15 pl-4 text-muted-foreground">{point}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">What changes with Xtimator</p>
          <ul className="mt-6 space-y-4">
            {industry.outcomes.map((outcome) => (
              <li key={outcome} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>{outcome}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-white/5 bg-white/[0.025]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">Common {industry.name.toLowerCase()} estimates</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {industry.projectExamples.map((example) => (
              <span key={example} className="rounded-full border border-white/10 bg-background px-4 py-2 text-sm text-muted-foreground">
                {example}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Questions from the field</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {industry.faqs.map((faq) => (
            <section key={faq.question} className="py-6">
              <h3 className="font-semibold">{faq.question}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{faq.answer}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
