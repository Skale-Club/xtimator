'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IntegrationCard, type IntegrationCardInitial } from './integration-card'
import type { IntegrationProvider } from '@/lib/platform-config'

interface ProviderConfig {
  id: IntegrationProvider
  title: string
  description: string
  initial: IntegrationCardInitial
}

export function IntegrationsTabs({ providers }: { providers: ProviderConfig[] }) {
  return (
    <Tabs defaultValue={providers[0]?.id} className="w-full gap-5">
      <div className="border-b border-border">
        <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
          {providers.map((p) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 gap-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:hidden transition-colors"
            >
              {p.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {providers.map((p) => (
        <TabsContent key={p.id} value={p.id} className="mt-0">
          <IntegrationCard
            provider={p.id}
            title={p.title}
            description={p.description}
            initial={p.initial}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
