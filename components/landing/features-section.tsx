import { BrainCircuit, FileBadge2, Link2, Smartphone } from 'lucide-react'

const features = [
  {
    icon: BrainCircuit,
    title: 'AI-generated estimate draft',
    description:
      'Turns field notes and site photos into a structured scope you can review instead of writing from a blank page.',
    benefit: 'Skip the blank-page struggle',
  },
  {
    icon: FileBadge2,
    title: 'Branded PDF output',
    description:
      'Send estimates that look polished, consistent, and ready for the customer without extra formatting work.',
    benefit: 'Look professional every time',
  },
  {
    icon: Link2,
    title: 'Share link for fast approvals',
    description:
      'Deliver a live estimate link when the customer wants the quote now, not after you get back to the office.',
    benefit: 'Faster customer response',
  },
  {
    icon: Smartphone,
    title: 'Mobile-first from the driveway',
    description:
      'Designed for iPhone and Android job-site use, where typing is slow and conditions are rarely perfect.',
    benefit: 'Works where you work',
  },
] as const

export function FeaturesSection() {
  return (
    <section className="border-b border-white/10 bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Why teams switch</p>
          <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Four pieces that shorten the gap between site visit and signed work.
          </h2>
          <p className="text-lg leading-7 text-muted-foreground">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
          {features.map(({ icon: Icon, title, description, benefit }) => (
            <div
              key={title}
              className="group rounded-2xl border border-[rgba(127,164,244,0.14)] bg-[#13131A] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.35)] transition-transform duration-150 hover:-translate-y-0.5"
            >
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-[#406EF1]/12 text-[#7FA4F4] shadow-[0_0_0_1px_rgba(127,164,244,0.16)]">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mb-2 text-xl font-bold tracking-[-0.01em]">{title}</h3>
              <p className="mb-4 leading-7 text-muted-foreground">{description}</p>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[#406EF1]/25 bg-[#406EF1]/10 px-3 py-1 text-sm font-bold text-[#7FA4F4]">
                {benefit}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
