import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ClientDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb back link */}
      <Skeleton className="h-4 w-32" />

      {/* Profile card — avatar + name + tag + contact lines */}
      <Card variant="glass">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <div className="space-y-2 pt-1">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 rounded-md shrink-0" />
          </div>
        </CardContent>
      </Card>

      {/* Projects card — table on desktop, cards on mobile */}
      <Card variant="glass">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="hidden md:block rounded-md border">
            <Skeleton className="h-11 w-full rounded-t-md rounded-b-none" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[53px] w-full rounded-none last:rounded-b-md" />
            ))}
          </div>
          <div className="md:hidden space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
