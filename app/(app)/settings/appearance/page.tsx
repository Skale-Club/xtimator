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
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Appearance</h1>
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Choose how the app looks. System follows your device&rsquo;s
            preference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggleRadioGroup />
        </CardContent>
      </Card>
    </div>
  )
}
