import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { getBranding } from "@/lib/platform-config"
import { LanguageProvider } from "@/lib/i18n/language-context"
import { SuppressWarnings } from "@/components/app-shell/suppress-warnings"
import { canonicalUrl, createPublicMetadata } from "@/lib/seo/metadata"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#0a0a0f' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()
  const title = b.siteTitle ?? b.appName
  const description =
    b.metaDescription ??
    'Create professional AI-powered estimates for service businesses in minutes.'
  const publicMetadata = createPublicMetadata({
    title,
    description,
    pathname: '/',
    siteName: b.appName,
    imageUrl: b.ogImageUrl,
    imageAlt: `${b.appName} — professional AI estimates in minutes`,
  })
  const facebookAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim()
  return {
    ...publicMetadata,
    metadataBase: new URL(canonicalUrl('/')),
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    ...(facebookAppId ? { other: { 'fb:app_id': facebookAppId } } : {}),
    // When custom branding exists: use org's favicon/logo.
    // Otherwise: omit icons so Next.js auto-serves app/icon.svg (branded, color-scheme aware)
    // and app/apple-icon.png — no need to override with a PNG fallback.
    icons: b.faviconUrl || b.logoUrl
      ? {
          icon: [{ url: b.faviconUrl ?? b.logoUrl!, type: 'image/png' }],
          apple: [{ url: b.faviconUrl ?? b.logoUrl!, type: 'image/png' }],
        }
      : undefined,
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      translate="no"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Xtimator owns translation through LanguageProvider. Browser
            translation mutates React-owned text nodes and can make React's
            navigation cleanup throw removeChild NotFoundError (XTIMATOR-6). */}
        <meta name="google" content="notranslate" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col">
        <SuppressWarnings />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <LanguageProvider>
            {children}
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
