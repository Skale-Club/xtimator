import { redirect } from 'next/navigation'

/**
 * /settings → redirect to the first tab (Company).
 * Layout in (tabs)/layout.tsx provides the header + nav + sub-pages grid.
 */
export default function SettingsIndexPage() {
  redirect('/settings/company')
}
