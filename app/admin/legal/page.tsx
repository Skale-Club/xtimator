import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import type { LegalPage } from '@/lib/queries/legal-pages'
import { LegalEditor } from './legal-editor'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function AdminLegalPage() {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data } = await svc
    .from('legal_pages')
    .select('*')
    .in('id', ['privacy_policy', 'terms_of_service'])

  const pages = (data ?? []) as LegalPage[]
  const privacy = pages.find(p => p.id === 'privacy_policy')
  const terms = pages.find(p => p.id === 'terms_of_service')

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Legal Pages</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Edit the public Privacy Policy and Terms of Service. Content is written in Markdown and rendered safely.</T>
        </p>
      </div>

      {(!privacy || !terms) ? (
        <Card variant="glass" className="p-8 text-center text-muted-foreground">
          <T>Legal page records not found. Apply the database migration first.</T>
        </Card>
      ) : (
        <Tabs defaultValue="privacy_policy" className="w-full gap-5">
          <div className="border-b border-border">
            <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
              {[
                { id: 'privacy_policy', label: 'Privacy Policy', page: privacy },
                { id: 'terms_of_service', label: 'Terms of Service', page: terms },
              ].map(({ id, label, page }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-3 gap-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:hidden transition-colors"
                >
                  <T>{label}</T>
                  {page.updated_by_email && (
                    <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                      <T>edited</T>
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="privacy_policy" className="mt-0">
            <Card variant="glass" className="p-6 md:p-8">
              <LegalEditor page={privacy} />
            </Card>
          </TabsContent>

          <TabsContent value="terms_of_service" className="mt-0">
            <Card variant="glass" className="p-6 md:p-8">
              <LegalEditor page={terms} />
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
