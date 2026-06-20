import { Skeleton } from '@/components/ui/skeleton'

export default function OnboardingLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-12">
      {/* Step header */}
      <header className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full max-w-md" />
      </header>

      {/* Question card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 rounded-full" />
          ))}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </div>
  )
}
