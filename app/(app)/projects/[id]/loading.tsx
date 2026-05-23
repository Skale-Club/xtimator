import { Skeleton } from '@/components/ui/skeleton'

export default function ProjectLoading() {
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </header>

      <div className="space-y-4">
        <div className="flex gap-2 border-b pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    </div>
  )
}
