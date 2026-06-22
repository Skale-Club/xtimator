import { Skeleton } from '@/components/ui/skeleton'

export default function BlogListLoading() {
  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] gradient-hero" />
      <main className="mx-auto max-w-4xl px-6 py-[clamp(48px,10vw,96px)]">
        <header className="mb-12">
          <Skeleton className="h-16 w-40" />
        </header>

        <div className="flex flex-col gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card overflow-hidden">
              <Skeleton className="h-48 w-full rounded-none" />
              <div className="space-y-3 p-6">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
