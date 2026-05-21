import { SettingsNav } from '@/components/settings/settings-nav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="px-6 pt-6">
        <SettingsNav />
      </div>
      {children}
    </div>
  )
}
