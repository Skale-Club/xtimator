'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * <T>...</T> — inline translation helper for use inside server components.
 *
 * Server components can't call hooks, so static English strings get rendered
 * as-is. Wrapping them in <T> defers translation to the client (where
 * useTranslation runs).
 *
 * Single string-child only. For interpolated strings use the `text` prop or
 * compose multiple <T> tags with a wrapping element.
 *
 * Examples:
 *   <T>Welcome back</T>
 *   <T text={`Welcome back, ${name}`} />
 */
type Props =
  | { children: string; text?: never }
  | { text: string; children?: never }

export function T(props: Props) {
  const { t } = useTranslation()
  const source = 'text' in props && props.text !== undefined ? props.text : props.children
  return <>{t(source as string)}</>
}
