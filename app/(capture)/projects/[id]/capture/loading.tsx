import { Skeleton } from '@/components/ui/skeleton'

export default function CaptureLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Skeleton className="h-60 w-60 rounded-full" />
    </div>
  )
}
