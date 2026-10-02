import { Fragment, type ReactNode } from 'react'
import { formatPhoneForDisplay } from '@/lib/phone/format'

// Tappable company contacts (tel:/mailto:/https). Mobile: one per line, no
// separator. sm+: one row with a middle-dot separator rendered as its own
// aria-hidden span so a wrap never leaves a dangling dot.
export function CompanyContactLinks({
  phone,
  email,
  website,
}: {
  phone?: string | null
  email?: string | null
  website?: string | null
}) {
  const linkClass = 'text-inherit no-underline hover:underline'
  const items: ReactNode[] = []
  if (phone) {
    items.push(
      <a key="phone" href={`tel:${phone}`} className={linkClass}>
        {formatPhoneForDisplay(phone)}
      </a>
    )
  }
  if (email) {
    items.push(
      <a key="email" href={`mailto:${email}`} className={linkClass}>
        {email}
      </a>
    )
  }
  if (website) {
    const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`
    items.push(
      <a key="website" href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {website}
      </a>
    )
  }
  if (items.length === 0) return null
  return (
    <p className="text-xs text-muted-foreground mt-0.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </p>
  )
}
