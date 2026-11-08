'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * <T>...</T> — inline translation helper for use inside server components.
 *
 * Server components can't call hooks, so static English strings get rendered
 * as-is. Wrapping them in <T> defers translation to the client (where
 * useTranslation runs).
 *
 * Single string-child only. For a sentence with a changing part, pass a
 * template with `{name}` placeholders and the `values` to fill them: the
 * TEMPLATE is what gets translated (and can live in the static dictionary),
 * so the sentence translates once instead of once per distinct value.
 *
 * Examples:
 *   <T>Welcome back</T>
 *   <T text="Up to {count} photos per estimate." values={{ count: 20 }} />
 */
type Values = Record<string, string | number>

type Props =
  | { children: string; text?: never; values?: Values }
  | { text: string; children?: never; values?: Values }

export function T(props: Props) {
  const { t } = useTranslation()
  const source = 'text' in props && props.text !== undefined ? props.text : props.children
  const translated = t(source as string)
  if (!props.values) return <>{translated}</>
  const values = props.values
  return <>{translated.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))}</>
}
