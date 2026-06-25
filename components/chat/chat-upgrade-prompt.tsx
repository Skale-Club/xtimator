'use client'

/**
 * components/chat/chat-upgrade-prompt.tsx — the inline upgrade affordance the
 * chat page renders when the active company's tier is NOT chat-entitled
 * (CHATMETER-02).
 *
 * Why a page-level prompt: the route gate (Plan 126-01) returns a 403
 * `chat_not_on_plan`, but the global UpgradeModal only intercepts 402 (quota),
 * NOT 403 — so a non-entitled owner who lands on /chat would otherwise see a
 * dead chat surface. This component is the PRIMARY conversion-preserving
 * affordance: a centered card inside the chat shell with a CTA to
 * /settings/billing (the same upgradeUrl the route 403 advertises).
 *
 * Self-contained — no props. All copy flows through useTranslation().
 */
import Link from 'next/link'
import { MessageSquare, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'

export function ChatUpgradePrompt() {
  const { t } = useTranslation()

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">{t('Chat')}</h1>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t('In-app chat is a Pro feature')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'Upgrade to Pro or Business to chat with your AI assistant — generate estimates, query your data, and ask trade how-to questions without leaving Xtimator.',
            )}
          </p>
          <Button asChild className="mt-2 w-full">
            <Link href="/settings/billing">{t('Upgrade your plan')}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
