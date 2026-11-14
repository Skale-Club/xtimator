import { T } from '@/components/i18n/t'

export function DashboardWelcome({ firstName }: { firstName: string }) {
  return (
    <section className="relative isolate px-4 py-4 sm:px-6 sm:py-6">
      {/* Gradient extends -top-16 to bleed under the glass topbar — backdrop-blur fuses the two surfaces.
          Bottom mask fades the gradient to alpha 0 so it dissolves smoothly into the page bg
          (instead of cutting off with a visible edge). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 inset-x-0 bottom-0 -z-10 gradient-hero
                   [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]
                   [-webkit-mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
      />
      <h1 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground sm:mb-3 sm:text-sm">
        <T>Dashboard</T>
      </h1>
      <p className="text-2xl font-medium tracking-tight [overflow-wrap:anywhere] sm:text-3xl sm:font-semibold">
        <T text={`Welcome back, ${firstName}`} />
      </p>
      <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:mt-2">
        <T>Track active projects, monitor estimate health, and start new work.</T>
      </p>
    </section>
  )
}
