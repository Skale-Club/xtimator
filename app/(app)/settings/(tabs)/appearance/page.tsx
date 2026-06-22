import { ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Appearance | Settings' }

export default function AppearanceTabPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          Appearance
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose how the app looks. System follows your device&rsquo;s preference.
        </p>
      </header>
      <Card variant="glass" className="p-8">
        <ThemeToggleRadioGroup />
      </Card>
    </div>
  )
}
