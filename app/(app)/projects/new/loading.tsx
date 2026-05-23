import { Skeleton } from '@/components/ui/skeleton'

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-[700px] space-y-6 p-4 md:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <div className="flex justify-between">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}
