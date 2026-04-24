import { Brain, FileText, Share2, Smartphone } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Estimate Generation',
    body: 'Claude AI converts your audio and photos into a professional, line-item estimate — no templates, no data entry.',
  },
  {
    icon: FileText,
    title: 'Branded PDF Output',
    body: 'Every estimate exports as a polished PDF with your logo, colors, and business details — ready to hand to a client.',
  },
  {
    icon: Share2,
    title: 'Shareable Links',
    body: 'Send a clean, mobile-friendly estimate link your clients can open on any device — no PDF attachments needed.',
  },
  {
    icon: Smartphone,
    title: 'Mobile-First Design',
    body: 'Built for job sites. Record audio, take photos, and send estimates from your phone — even on iOS Safari.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-card/30">
      <div className="mx-auto w-full max-w-[1200px] px-6">
        {/* Section header */}
        <div className="text-center mb-16 flex flex-col gap-3">
          <p className="text-[length:var(--font-size-sm)] font-[var(--font-weight-normal)] tracking-[0.04em] text-primary uppercase">
            Why EstimateBuilder Pro
          </p>
          <h2 className="text-[length:var(--font-size-xl)] sm:text-3xl font-[var(--font-weight-bold)] tracking-[var(--tracking-tight)] text-foreground">
            Built for the Field, Polished for the Office
          </h2>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <Card
                key={feature.title}
                className={cn('card-hover-gradient transition-all duration-200 h-full')}
              >
                <CardContent className="pt-6 flex flex-col gap-3 h-full">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="text-[length:var(--font-size-xl)] font-[var(--font-weight-bold)] tracking-[var(--tracking-tight)] text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-[length:var(--font-size-base)] font-[var(--font-weight-normal)] leading-[1.5] text-muted-foreground flex-1">
                    {feature.body}
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
