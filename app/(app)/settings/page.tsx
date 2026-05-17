import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, ChevronRight, CreditCard, FileText, Globe, MessageSquare, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCompanySettings } from '@/lib/queries/company'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const SUB_PAGES = [
  {
    href: '/settings/billing',
    title: 'Billing',
    description: 'Manage your subscription plan, usage, and upgrade options.',
    Icon: CreditCard,
  },
  {
    href: '/settings/payments',
    title: 'Payments',
    description:
      'Connect Stripe to accept card payments from customers directly on your estimates.',
    Icon: Wallet,
  },
  {
    href: '/settings/price-book',
    title: 'Price Book',
    description: 'Manage your standard pricing for AI-powered estimates.',
    Icon: BookOpen,
  },
  {
    href: '/settings/estimate-templates',
    title: 'Estimate Templates',
    description:
      'Customize the greeting, opener, and signature for your plain-text estimates.',
    Icon: FileText,
  },
  {
    href: '/settings/custom-domain',
    title: 'Custom Domain',
    description:
      'Serve estimates from your own domain (e.g., estimates.mycompany.com).',
    Icon: Globe,
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description:
      'Connect WhatsApp to receive voice and photo estimates from the field.',
    Icon: MessageSquare,
  },
] as const

export default async function SettingsPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const supabase = await createClient()
  const company = await getCompanySettings(supabase, claims.sub as string)

  if (!company) {
    redirect('/onboarding')
  }

  return (
    <div className="w-full max-w-none space-y-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          Settings
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage company profile, estimate behavior, notifications, appearance,
          and account access from one full-width workspace.
        </p>
      </header>

      <SettingsTabs company={company} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SUB_PAGES.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="block rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card
              variant="glass"
              className="h-full p-6 transition-shadow hover:shadow-glow-brand"
            >
              <CardHeader className="flex flex-row items-start justify-between p-0">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
                  <div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription className="mt-1">
                      {description}
                    </CardDescription>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
