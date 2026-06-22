import { Skeleton } from '@/components/ui/skeleton'

export default function DemoClientsLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-7 w-24" />

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="bg-muted/40 px-4 py-2 flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
