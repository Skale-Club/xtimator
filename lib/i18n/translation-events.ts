/**
 * Tells the language providers that a batch of async translations has landed in
 * the translator's cache.
 *
 * useTranslation() returns the English source for any string it has not
 * translated yet and resolves it in the background. Without this signal nothing
 * re-renders once the translation arrives, so the screen stays in English until
 * some unrelated update happens to repaint that component. The providers
 * subscribe here and change their context value once per landed batch, which
 * re-renders every t() consumer exactly once with the cached translation.
 *
 * Its own module so language-context.tsx and use-translation.ts (which imports
 * language-context) do not import each other.
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function onTranslationsLoaded(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyTranslationsLoaded(): void {
  listeners.forEach((listener) => listener())
}
