import { Skeleton } from '@/components/ui/skeleton'

export default function CaptureLoading() {
  return (
    <div className="flex flex-1 flex-col">
      {/* App-style header bar with back button + title */}
      <header className="flex items-center gap-3 border-b border-border px-4 h-14 shrink-0">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </header>

      {/* Main — centered record button + waveform + label */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 gap-8">
        <Skeleton className="h-60 w-60 rounded-full" />
        <div className="space-y-2 text-center">
          <Skeleton className="h-3 w-40 mx-auto" />
          <Skeleton className="h-5 w-56 mx-auto" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </main>
    </div>
  )
}
