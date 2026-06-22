import { Skeleton } from '@/components/ui/skeleton'

export default function BlogPostLoading() {
  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] gradient-hero" />
      <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
        <article>
          <header className="mb-10 space-y-4">
            <Skeleton className="h-14 w-5/6" />
            <Skeleton className="h-3 w-40" />
          </header>

          <Skeleton className="mb-10 h-64 w-full rounded-2xl" />

          <div className="rounded-xl border p-8 sm:p-10 space-y-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className={`h-3 ${i % 4 === 3 ? 'w-3/4' : 'w-full'}`}
              />
            ))}
          </div>
        </article>
      </main>
    </div>
  )
}
