import type { ReactNode } from 'react'

/**
 * Top-of-page section title, styled to match the dashboard's "DASHBOARD" label.
 * Top-level pages render this on the page itself instead of in the navbar.
 *
 * Server-safe (no hooks) so it works in both server and client components.
 * Pass the label wrapped in <T> so it stays translatable, e.g.
 *   <PageHeading><T>Projects</T></PageHeading>
 */
export function PageHeading({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
      {children}
    </h1>
  )
}
