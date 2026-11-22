import { shareText } from '@/lib/i18n/share-translations'

/**
 * Public share page: the "link expired" card, in the estimate's own language
 * (the lock check returns it even for an expired link). Server component, so
 * it reads the static dictionary directly instead of the t() hook.
 */
export function ExpiredLinkNotice({ language }: { language: 'en' | 'pt' | 'es' | null | undefined }) {
  return (
    <main className="mx-4 mt-16 max-w-lg rounded-xl bg-white px-6 py-10 text-center shadow-lg sm:mx-auto sm:mt-24">
      <h1 className="text-2xl font-semibold tracking-tight">
        {shareText(language, 'This estimate link has expired')}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {shareText(
          language,
          'For your security, estimate links expire after a period of inactivity. Please ask the sender to re-send the estimate — that will give you a fresh, working link.',
        )}
      </p>
    </main>
  )
}
