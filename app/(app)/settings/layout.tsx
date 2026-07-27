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
  return (
    <div className="flex h-full flex-col">
      <SettingsLayoutClient isDemo={isDemo}>{children}</SettingsLayoutClient>
    </div>
  )
}
