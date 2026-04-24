import { Mic, Camera, FileText } from 'lucide-react'

const steps = [
  {
    icon: Mic,
    eyebrow: 'Step 1',
    title: 'Record audio',
    description:
      'Walk the property and talk through measurements, materials, and special requests while your hands stay free.',
  },
  {
    icon: Camera,
    eyebrow: 'Step 2',
    title: 'Add photos',
    description:
      'Drop in site photos so the AI can anchor line items to the real condition of the work.',
  },
  {
    icon: FileText,
    eyebrow: 'Step 3',
    title: 'Get estimate',
    description:
      'Review the draft estimate, then send a branded PDF or live link without rebuilding the job from scratch.',
  },
] as const

export function HowItWorksSection() {
  return (
    <section className="border-b border-white/10 bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="mb-10 max-w-2xl space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
          <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Built around the way estimates happen in the field.
          </h2>
          <p className="text-lg leading-7 text-muted-foreground">
            No clipboard rewrite later. Capture the job once and turn that visit into a professional quote package.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
          {steps.map(({ icon: Icon, eyebrow, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-[rgba(127,164,244,0.14)] bg-[#13131A] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
            >
              <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl bg-[#406EF1]/12 text-[#7FA4F4] shadow-[0_0_0_1px_rgba(127,164,244,0.16)]">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <p className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-[#406EF1]">{eyebrow}</p>
              <h3 className="mb-3 text-xl font-bold">{title}</h3>
              <p className="leading-7 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
