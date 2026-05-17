import { ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

export const metadata = { title: 'Appearance' }

export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          Appearance
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalize how Xtimator looks across your devices.
        </p>
      </header>
      <Card variant="glass" className="p-8">
        <CardHeader className="p-0">
          <CardTitle className="text-xl">Theme</CardTitle>
          <CardDescription>
            Choose how the app looks. System follows your device&rsquo;s
            preference.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pt-6">
          <ThemeToggleRadioGroup />
        </CardContent>
      </Card>
    </div>
  )
}
