import Link from 'next/link'
import { BookOpen, ChevronRight, CreditCard, FileText, Globe, MessageSquare, Send, Wallet } from 'lucide-react'
import { SettingsNav } from '@/components/settings/settings-nav'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

/**
 * Layout for the 5 main settings tabs (Company, Defaults, Notifications,
 * Appearance, Account). Each tab is a real route — bookmark, back, refresh
 * preserve which tab you're on.
 *
 * Route group `(tabs)` keeps this layout from wrapping sibling sub-pages like
 * /settings/billing, /price-book etc. that have their own UI.
 *
 * Below the active tab's content we render a grid of quick-link cards to the
 * other settings areas (Billing, Payments, Price Book, Estimate Templates,
 * Custom Domain, Integrations) so they're always one click away.
 */
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
    description: 'Connect Stripe to accept card payments from customers directly on your estimates.',
    Icon: Wallet,
  },
  {
    href: '/price-book',
    title: 'Price Book',
    description: 'Manage your standard pricing for AI-powered estimates.',
    Icon: BookOpen,
  },
  {
    href: '/settings/estimate-templates',
    title: 'Estimate Templates',
    description: 'Customize the greeting, opener, and signature for your plain-text estimates.',
    Icon: FileText,
  },
  {
    href: '/settings/custom-domain',
    title: 'Custom Domain',
    description: 'Serve estimates from your own domain (e.g., estimates.mycompany.com).',
    Icon: Globe,
  },
  {
    href: '/settings/integrations',
    title: 'Integrations',
    description: 'Connect WhatsApp to receive voice and photo estimates from the field.',
    Icon: MessageSquare,
  },
  {
    href: '/settings/delivery',
    title: 'Delivery',
    description: 'Enable email and SMS delivery of estimates, and require digital signatures from clients.',
    Icon: Send,
  },
] as const

export default function SettingsTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-none space-y-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Settings</T>
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          <T>Manage company profile, estimate behavior, notifications, appearance, and account access from one full-width workspace.</T>
        </p>
      </header>

      <SettingsNav />

      <div>{children}</div>

      <section aria-label="Other settings">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <T>More</T>
        </h2>
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
                      <CardTitle className="text-lg"><T text={title} /></CardTitle>
                      <CardDescription className="mt-1"><T text={description} /></CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
