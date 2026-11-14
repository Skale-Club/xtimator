import { notFound } from 'next/navigation'
import { MobileHeader } from '@/components/app-shell/mobile-header'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome'
import { StatCards } from '@/components/dashboard/stat-cards'
import { ProjectList } from '@/components/dashboard/project-list'
import { ListCard } from '@/components/ui/list-page'
import { ChatBubble } from '@/components/chat/chat-bubble'
import type { ProjectWithClient } from '@/lib/queries/dashboard'

const PROJECT_NAMES = [
  'Kitchen Remodel', 'Water Heater Replacement', 'Deck Staining', 'Roof Repair',
  'Bathroom Tile', 'Fence Install', 'Interior Painting', 'HVAC Tune-up',
  'Driveway Sealing', 'Gutter Cleaning', 'Window Replacement', 'Basement Waterproofing',
]

const projects: ProjectWithClient[] = PROJECT_NAMES.map((name, index) => ({
  id: `preview-project-${index + 1}`,
  name,
  project_type: 'Remodel',
  status: index % 2 ? 'sent' : 'draft',
  total: 800 + index * 437,
  currency_code: 'USD',
  created_at: new Date(Date.UTC(2026, 10, 12 - index)).toISOString(),
  client: { id: `preview-client-${index + 1}`, name: index % 2 ? 'Ben Carter' : 'Ava Thompson' },
  payment_status: null,
  paid_at: null,
}))

/** Read-only visual fixture: real dashboard components, without an account. */
export default function DashboardPreview() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <>
      <div inert className="flex h-dvh overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <MobileHeader
            branding={{ appName: 'Xtimator', logoUrl: null }}
            navUser={{ email: 'vanildo@example.com', avatarUrl: null }}
            userName="Vanildo"
            isDemo
          />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6">
            <div className="pb-12">
              <DashboardWelcome firstName="Vanildo" />
              <StatCards stats={{ totalProjects: 44, pendingEstimates: 32, acceptedEstimates: 7, totalRevenue: 18908 }} currencyCode="USD" />
              <section className="mt-8 px-4 sm:mt-12 sm:px-6">
                <ListCard><ProjectList projects={projects} /></ListCard>
              </section>
            </div>
          </main>
        </div>
        <BottomNav isDemo />
      </div>
      <ChatBubble chatEnabled />
    </>
  )
}
