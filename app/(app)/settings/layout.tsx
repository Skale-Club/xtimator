import { SettingsLayoutClient } from '@/components/settings/settings-layout-client'
import { isDemoSession } from '@/lib/demo/guard'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const isDemo = await isDemoSession()

  // `h-full` at all breakpoints: the settings container fills one scrollport
  // (`main`'s height) so the left rail's self-scrolling, viewport-height
  // sticky column (`h-[calc(100vh-4rem)]` + `overflow-y-auto`) has a fixed
  // containing block — the same model desktop always used, now applied to
  // phone/tablet too. Page content taller than one screen overflows into
  // `main` (the app-shell scrollport) and scrolls there.
  //
  // Demo and real-tenant sessions both render this same tree, unconditionally
  // — SettingsLayoutClient threads isDemo down to SettingsNav, which filters
  // its own tab list rather than this layout branching on demo at all.
  // min-h-full, not h-full: with a fixed height the container ended at one
  // screen, so the sticky rail's containing block ended there too and the rail
  // scrolled away with the page. Growing with the content keeps it pinned.
  // md:-mb-6 cancels main's md:pb-6 so the rail (and its right border) runs
  // all the way to the bottom of the screen instead of stopping 24px short;
  // the content column keeps its own bottom padding.
  return (
    <div className="flex min-h-full flex-col md:-mb-6">
      <SettingsLayoutClient isDemo={isDemo}>{children}</SettingsLayoutClient>
    </div>
  )
}
