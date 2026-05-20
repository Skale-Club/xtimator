import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export const metadata = { title: "You're offline" }

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center bg-background">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-muted">
        <WifiOff className="w-10 h-10 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-muted-foreground max-w-sm">
          No internet connection. Previously visited estimates are still available from the cache.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Go to dashboard
      </Link>
    </div>
  )
}
