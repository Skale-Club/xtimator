import Link from 'next/link'
import { DemoNav } from '@/components/demo/demo-nav'

export const metadata = { title: 'Xtimator — Live Demo' }

/**
 * Public, read-only demo shell.
 *
 * This route tree is intentionally auth-INDEPENDENT: it never signs anyone in
 * and never reads or writes the auth session cookie. That means it cannot log a
 * real user out, and a real user's session never leaks into it — the demo and a
 * logged-in account are genuinely separate pages that can be open side by side.
 * Data is read via the service-role client scoped to the demo company.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Read-only banner with a signup CTA (plain link — no session to end). */}
      <div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
        <span className="text-center">
          You&apos;re viewing a read-only Xtimator demo with sample data.{' '}
          <Link
            href="/?auth=signup"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Create your account
          </Link>{' '}
          to build real estimates.
        </span>
      </div>
      <DemoNav />
      <main className="mx-auto w-full max-w-5xl px-2 pb-16 pt-2 md:px-4 md:pt-4">{children}</main>
    </div>
  )
}
