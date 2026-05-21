// v2-subsidebar
import { SettingsNav } from '@/components/settings/settings-nav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full gap-0">
      {/* Sub-sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border pt-8 px-3 pb-8">
        <SettingsNav />
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}
