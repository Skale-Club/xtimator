'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SidePanelColumn, SidePanelMobilePicker, type SidePanelGroup } from '@/components/ui/side-panel'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  TENANT_TEMPLATE_CATALOG,
  EDITABLE_CHANNELS,
  type TemplateCatalogEntry,
} from '@/lib/notifications/template-catalog'
import type { EventCategory, EventType } from '@/lib/notifications/event-types'
import type { TemplateChannel } from '@/lib/notifications/template-resolver'
import type { NotificationTemplateRow } from '@/lib/actions/admin-notification-templates'
import { NotificationTemplateEditor } from '@/components/admin/notification-template-editor'

const TAB_TRIGGER_CLASSES =
  'h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 gap-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:hidden transition-colors'

// Ordered so Estimates/Billing/System (delivered to tenants) come before the
// internal, never-delivered sentinel group.
const CATEGORY_ORDER: EventCategory[] = ['estimate', 'billing', 'system', '_dropped']

const CATEGORY_LABELS: Record<EventCategory, string> = {
  estimate: 'Estimates',
  billing: 'Billing',
  system: 'System',
  _dropped: 'Internal (not delivered to tenants)',
}

const CHANNEL_LABELS: Record<TemplateChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  sms: 'SMS',
}

function groupByCategory(
  entries: TemplateCatalogEntry[],
): Map<EventCategory, TemplateCatalogEntry[]> {
  const map = new Map<EventCategory, TemplateCatalogEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.category) ?? []
    list.push(entry)
    map.set(entry.category, list)
  }
  return map
}

export function NotificationTemplatesPanel({
  initialTemplates,
}: {
  initialTemplates: NotificationTemplateRow[]
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [audience, setAudience] = useState<'tenant' | 'customer'>('tenant')
  const [selectedEvent, setSelectedEvent] = useState<EventType>(
    TENANT_TEMPLATE_CATALOG[0]!.eventType,
  )
  const [selectedChannel, setSelectedChannel] = useState<TemplateChannel>('in_app')

  const grouped = useMemo(() => groupByCategory(TENANT_TEMPLATE_CATALOG), [])

  const eventGroups = useMemo<SidePanelGroup[]>(
    () =>
      CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => ({
        key: category,
        label: t(CATEGORY_LABELS[category]),
        items: grouped.get(category)!.map((entry) => ({ key: entry.eventType, label: entry.label })),
      })),
    [grouped, t],
  )

  // Keyed by `${event_type}:${channel}` so the editor can look up its
  // matching row (or null, for the 34 not-yet-saved combinations) in O(1).
  const templateMap = useMemo(() => {
    const map = new Map<string, NotificationTemplateRow>()
    for (const row of initialTemplates) {
      map.set(`${row.event_type}:${row.channel}`, row)
    }
    return map
  }, [initialTemplates])

  const existing = templateMap.get(`${selectedEvent}:${selectedChannel}`) ?? null

  return (
    <Tabs
      value={audience}
      onValueChange={(v) => setAudience(v as 'tenant' | 'customer')}
      className="w-full gap-5"
    >
      <div className="border-b border-[var(--glass-border)] bg-[var(--glass-bg-light)]">
        <TabsList
          variant="line"
          className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start"
        >
          <TabsTrigger value="tenant" className={TAB_TRIGGER_CLASSES}>
            <T>Tenant</T>
          </TabsTrigger>
          <TabsTrigger value="customer" className={TAB_TRIGGER_CLASSES}>
            <T>End Customer</T>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="tenant" className="mt-0">
        <Card variant="glass" className="p-0">
          <div className="flex flex-col md:flex-row">
            <SidePanelColumn
              id="admin-notification-events"
              title={t('Notification events')}
              groups={eventGroups}
              activeKey={selectedEvent}
              onSelect={(key) => setSelectedEvent(key as EventType)}
              getGroupTestId={(key) => `category-group-${key}`}
            />
            <div className="border-b border-[var(--glass-border)] p-3 md:hidden">
              <SidePanelMobilePicker
                title={t('Notification events')}
                groups={eventGroups}
                activeKey={selectedEvent}
                onSelect={(key) => setSelectedEvent(key as EventType)}
                className="h-10 w-full max-w-none justify-between"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
              <Tabs
                value={selectedChannel}
                onValueChange={(v) => setSelectedChannel(v as TemplateChannel)}
              >
                <TabsList
                  variant="line"
                  className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start border-b border-[var(--glass-border)]"
                >
                  {EDITABLE_CHANNELS.map((channel) => (
                    <TabsTrigger key={channel} value={channel} className={TAB_TRIGGER_CLASSES}>
                      {t(CHANNEL_LABELS[channel])}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Keyed by (event, channel) so React remounts the editor on
                  navigation instead of stale-merging local form state across
                  two different templates. */}
              <NotificationTemplateEditor
                key={`${selectedEvent}:${selectedChannel}`}
                eventType={selectedEvent}
                channel={selectedChannel}
                existing={existing}
                onSaved={() => router.refresh()}
              />
            </div>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="customer" className="mt-0">
        <Card variant="glass" className="p-6">
          <p className="text-sm text-muted-foreground">
            <T>
              No end-customer events are defined yet — end-customer templates ship in a future
              phase.
            </T>
          </p>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
