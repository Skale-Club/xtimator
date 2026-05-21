import { ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

export const metadata = { title: 'Appearance | Settings' }

export default function AppearanceTabPage() {
  return (
    <Card variant="glass" className="p-8">
      <CardHeader className="p-0">
        <CardTitle className="text-xl">Theme</CardTitle>
        <CardDescription>
          Choose how the app looks. System follows your device&rsquo;s preference.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pt-6">
        <ThemeToggleRadioGroup />
      </CardContent>
    </Card>
  )
}
