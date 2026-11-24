import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import type { getWhatsAppReadiness } from '@/lib/whatsapp/readiness'

export function WhatsAppReadiness({ readiness }: { readiness: ReturnType<typeof getWhatsAppReadiness> }) {
  return (
    <Card variant="glass" className="space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold"><T>WhatsApp activation</T></h2>
        <span className="text-sm text-muted-foreground">
          <T text={readiness.ready ? 'Configuration complete' : 'Setup required'} />
        </span>
      </div>
      {readiness.missingSettings.length > 0 && (
        <div className="space-y-1">
          <Link className="text-sm font-medium underline" href="/admin/integrations/whatsapp">
            <T>Open WhatsApp integration settings</T>
          </Link>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {readiness.missingSettings.map((setting) => <li key={setting}><T text={setting} /></li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {readiness.locales.map((locale) => (
          <div key={locale.languageCode} className="space-y-2 rounded-md border p-3 text-sm">
            <h3 className="font-medium"><T text={locale.label} /> <span className="font-mono text-xs text-muted-foreground">{locale.languageCode}</span></h3>
            {locale.welcome === 'missing_name' ? (
              <Link className="underline" href="/admin/integrations/whatsapp#whatsapp-welcome">
                <T>Set the welcome template name</T>
              </Link>
            ) : locale.welcome === 'needs_import' ? (
              <p><T>Import an approved welcome template with one quick-reply button and no body variables.</T> <code>{locale.welcomeName}</code></p>
            ) : <p className="text-muted-foreground"><T>Welcome template approved</T></p>}
            {locale.missingEvents.length > 0 && (
              <>
                <p className="text-muted-foreground"><T>Approved event bindings needed</T></p>
                <ul className="space-y-1 break-words text-xs">
                  {locale.missingEvents.map(({ event, suggestedTemplate }) => (
                    <li key={event}><code>{event}</code> <span aria-hidden="true">→</span> <code>{suggestedTemplate}</code></li>
                  ))}
                </ul>
              </>
            )}
            {!locale.ownerUpdateApproved && <p><T>Import approved</T> <code>owner_update</code></p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        <T>Approve each variant in Meta WhatsApp Manager and import it below. Verify the setup with a real onboarding and estimate after activation.</T>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Link className="text-sm underline" href="#whatsapp-template-manager"><T>Manage template bindings</T></Link>
        <Link className="text-sm underline" href="/admin/integrations/billing">
          <T>Check the messaging rate calibration before activation</T>
        </Link>
      </div>
    </Card>
  )
}
