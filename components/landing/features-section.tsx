import { BrainCircuit, FileBadge2, Link2, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'

const features = [
  {
    icon: BrainCircuit,
    title: 'AI-generated estimate draft',
    description: 'Turns field notes and site photos into a structured scope you can review instead of writing from a blank page.',
  },
  {
    icon: FileBadge2,
    title: 'Branded PDF output',
    description: 'Send estimates that look polished, consistent, and ready for the customer without extra formatting work.',
  },
  {
    icon: Link2,
    title: 'Share link for fast approvals',
    description: 'Deliver a live estimate link when the customer wants the quote now, not after you get back to the office.',
  },
  {
    icon: Smartphone,
    title: 'Mobile-first from the driveway',
    description: 'Designed for iPhone and Android job-site use, where typing is slow and conditions are rarely perfect.',
  },
] as const

export function FeaturesSection() {
  return (
    <section className="border-b border-white/10 bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Why teams switch</p>
          <h2 className="text-3xl font-semibold tracking-[var(--tracking-tight)] sm:text-4xl">
            Four pieces that shorten the gap between site visit and signed work.
          </h2>
          <p className="text-lg text-muted-foreground">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-white/10 bg-white/[0.045] py-0 backdrop-blur transition-transform duration-150 hover:-translate-y-0.5">
              <CardHeader className="px-6 pt-6">
                <div className="mb-3 inline-flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-primary/14 text-primary shadow-[0_0_0_1px_rgba(127,164,244,0.14)]">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-xl font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]">{title}</h3>
                <CardDescription className="text-base leading-7">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pb-6 text-sm text-muted-foreground">
                Built for real quoting pressure: fewer delays, less duplicate entry, and a cleaner handoff to the customer.
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
