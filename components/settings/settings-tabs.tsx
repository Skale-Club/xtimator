'use client'

import Link from 'next/link'
import {
  Bell,
  Building2,
  ChevronRight,
  FileText,
  Palette,
  ShieldCheck,
} from 'lucide-react'

import type { CompanySettings } from '@/lib/queries/company'
import { AccountSection } from '@/components/settings/account-section'
import { CompanyInfoForm } from '@/components/settings/company-info-form'
import { DefaultsForm } from '@/components/settings/defaults-form'
import { NotificationsForm } from '@/components/settings/notifications-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SettingsTabsProps {
  company: CompanySettings
}

const SETTINGS_STEPS = [
  {
    value: 'company',
    label: 'Company',
    description: 'Profile and brand',
    icon: Building2,
  },
  {
    value: 'defaults',
    label: 'Defaults',
    description: 'Estimate rules',
    icon: FileText,
  },
  {
    value: 'notifications',
    label: 'Notifications',
    description: 'Email events',
    icon: Bell,
  },
  {
    value: 'appearance',
    label: 'Appearance',
    description: 'Theme preference',
    icon: Palette,
  },
  {
    value: 'account',
    label: 'Account',
    description: 'Login and access',
    icon: ShieldCheck,
  },
]

export function SettingsTabs({ company }: SettingsTabsProps) {
  return (
    <Tabs defaultValue="company" className="w-full gap-5">
      <div className="border-b border-border">
        <TabsList
          variant="line"
          className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start"
        >
          {SETTINGS_STEPS.map((step) => {
            const Icon = step.icon
            return (
              <TabsTrigger
                key={step.value}
                value={step.value}
                className="
                  h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3
                  gap-2 text-sm font-medium text-muted-foreground
                  hover:text-foreground
                  data-[state=active]:border-primary dark:data-[state=active]:border-primary
                  data-[state=active]:text-foreground data-[state=active]:shadow-none
                  data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground
                  after:hidden transition-colors
                "
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{step.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>

      <TabsContent value="company" className="mt-0">
        <CompanyInfoForm company={company} />
      </TabsContent>

      <TabsContent value="defaults" className="mt-0">
        <DefaultsForm company={company} />
      </TabsContent>

      <TabsContent value="notifications" className="mt-0">
        <NotificationsForm company={company} />
      </TabsContent>

      <TabsContent value="appearance" className="mt-0">
        <Card className="w-full rounded-[var(--radius-md)]">
          <Link
            href="/settings/appearance"
            className="block rounded-[var(--radius-md)] transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader className="flex flex-row items-center justify-between border-b border-border">
              <div className="flex items-start gap-3">
                <Palette className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Dark, light, or follow your device&rsquo;s preference.
                  </CardDescription>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="py-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-border bg-background p-4">
                  <div className="mb-3 h-12 rounded-[var(--radius-sm)] border bg-white" />
                  <p className="text-sm font-medium">Light</p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-border bg-background p-4">
                  <div className="mb-3 h-12 rounded-[var(--radius-sm)] border bg-neutral-950" />
                  <p className="text-sm font-medium">Dark</p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-border bg-background p-4">
                  <div className="mb-3 grid h-12 grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border">
                    <span className="bg-white" />
                    <span className="bg-neutral-950" />
                  </div>
                  <p className="text-sm font-medium">System</p>
                </div>
              </div>
            </CardContent>
          </Link>
        </Card>
      </TabsContent>

      <TabsContent value="account" className="mt-0">
        <AccountSection />
      </TabsContent>
    </Tabs>
  )
}
