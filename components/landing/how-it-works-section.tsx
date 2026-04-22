import { Mic, Camera, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    number: '01',
    icon: Mic,
    title: 'Record a Walkthrough',
    description: 'Walk the job site and narrate what you see. Works on iOS and Android — no app install needed.',
  },
  {
    number: '02',
    icon: Camera,
    title: 'Add Job Site Photos',
    description: 'Snap or upload photos. AI reads the images and adds context to your estimate automatically.',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Receive Your Estimate',
    description: 'AI generates a complete, itemized estimate. Review, adjust, and send — all in under 5 minutes.',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto w-full max-w-[1200px] px-6">
        {/* Section header */}
        <div className="text-center mb-16 flex flex-col gap-3">
          <p className="text-[length:var(--font-size-sm)] font-[var(--font-weight-normal)] tracking-[0.04em] text-primary uppercase">
            How It Works
          </p>
          <h2 className="text-[length:var(--font-size-xl)] sm:text-3xl font-[var(--font-weight-bold)] tracking-[var(--tracking-tight)] text-foreground">
            Three Steps. Zero Typing.
          </h2>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8 relative">
          {/* Connector line (desktop only) */}
          <div
            className="hidden sm:block absolute top-10 left-[calc(33.3%+1.5rem)] right-[calc(33.3%+1.5rem)] h-px border-t border-dashed border-border"
            aria-hidden="true"
          />

          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <Card
                key={step.number}
                className={cn('card-hover-gradient transition-shadow duration-200 hover:shadow-md')}
              >
                <CardContent className="pt-6 flex flex-col gap-4">
                  {/* Number badge */}
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full border border-primary/60 flex items-center justify-center text-primary font-bold text-[length:var(--font-size-sm)] flex-shrink-0">
                      {step.number}
                    </span>
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>

                  {/* Title */}
                  <h3 className="text-[length:var(--font-size-xl)] font-[var(--font-weight-bold)] tracking-[var(--tracking-tight)] text-foreground">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-[length:var(--font-size-base)] font-[var(--font-weight-normal)] leading-[1.5] text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
