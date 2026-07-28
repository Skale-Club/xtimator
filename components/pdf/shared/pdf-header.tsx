// components/pdf/shared/pdf-header.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared company header block (logo, name,
// contact line, address, language badge) for both PDF templates. Structure is
// byte-identical between Classic/Modern; only StyleSheet VALUES and a couple
// of dynamic color overrides (Classic-only) differ, expressed here as props.
//
// NOTE on invocation style: both templates call this as a PLAIN FUNCTION
// (`{PdfHeader({...})}`) rather than JSX (`<PdfHeader ... />`). This is
// deliberate — tests/unit/pdf/estimate-pdf-baseline-order.test.tsx (and other
// direct-call tests) invoke EstimatePDF/EstimatePDFModern as plain functions
// (no React renderer) and walk the returned tree with
// tests/unit/estimate/_pdf-text-walker.ts, which only resolves React-pdf's
// own Text/View primitives — it does NOT invoke nested custom function
// components. Calling PdfHeader eagerly as a function guarantees the tree
// returned by EstimatePDF already contains fully-resolved View/Text nodes at
// this position, preserving the pre-refactor text-content order exactly.

import { View, Text, Image, Link } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { formatAddress } from '@/lib/estimate/document/format'
import { formatPhoneForDisplay } from '@/lib/phone/format'

export interface PdfHeaderCompany {
  name: string
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  logo_url: string | null
}

export interface PdfHeaderStyles {
  header: object
  headerLeft: object
  headerRight: object
  logo: object
  companyName: object
  companyContact: object
  contactLink: object
  nameLink: object
  langBadge: object
}

export interface PdfHeaderProps {
  company: PdfHeaderCompany
  /** Classic passes brandColor here (dynamic border-bottom on the fixed header). Modern passes undefined — its header border is fully static. */
  headerBorderColor?: string
  /** Classic passes brandText here (company name + name-link color override). Modern passes undefined — its company name color is fully static. */
  companyNameColor?: string
  langLabel: string
  styles: PdfHeaderStyles
}

export function PdfHeader({
  company,
  headerBorderColor,
  companyNameColor,
  langLabel,
  styles,
}: PdfHeaderProps) {
  const companyAddress = formatAddress(company)

  return (
    <View
      style={
        headerBorderColor
          ? [styles.header, { borderBottomColor: headerBorderColor }]
          : styles.header
      }
      fixed
    >
      <View style={styles.headerLeft}>
        <View>
          <Text
            style={
              companyNameColor
                ? [styles.companyName, { color: companyNameColor }]
                : styles.companyName
            }
          >
            {company.website ? (
              <Link
                src={company.website}
                style={
                  companyNameColor
                    ? [styles.nameLink, { color: companyNameColor }]
                    : styles.nameLink
                }
              >
                {company.name}
              </Link>
            ) : (
              company.name
            )}
          </Text>
          <Text style={styles.companyContact}>
            {(
              [
                company.phone && (
                  <Link
                    key="phone"
                    src={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                    style={styles.contactLink}
                  >
                    {formatPhoneForDisplay(company.phone)}
                  </Link>
                ),
                company.email && (
                  <Link
                    key="email"
                    src={`mailto:${company.email}`}
                    style={styles.contactLink}
                  >
                    {company.email}
                  </Link>
                ),
                company.website && (
                  <Link
                    key="website"
                    src={company.website}
                    style={styles.contactLink}
                  >
                    {company.website}
                  </Link>
                ),
              ].filter(Boolean) as ReactNode[]
            ).reduce<ReactNode[]>(
              (acc, node, i) => (i === 0 ? [node] : [...acc, '  |  ', node]),
              [],
            )}
          </Text>
          {companyAddress && (
            <Text style={styles.companyContact}>{companyAddress}</Text>
          )}
        </View>
      </View>
      {/* RIGHT — language badge stacked above logo (Quick-260526-jo4) */}
      <View style={styles.headerRight}>
        {/* Language indicator chip — text-based (SVG flags not supported in react-pdf) */}
        <Text style={styles.langBadge}>{langLabel}</Text>
        {company.logo_url && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={company.logo_url} style={styles.logo} />
        )}
      </View>
    </View>
  )
}
