import { Skeleton } from '@/components/ui/skeleton'

export default function LegalPageLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
      <article>
        <header className="mb-10 space-y-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-3 w-40" />
        </header>
        <div className="rounded-xl border p-8 sm:p-10 space-y-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-3 ${i % 5 === 4 ? 'w-2/3' : 'w-full'}`}
            />
          ))}
        </div>
      </article>
    </main>
  )
}
