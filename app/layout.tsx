import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { getBranding } from "@/lib/platform-config"
import { readThemeCookie } from "@/lib/theme/cookie"
import { LanguageProvider } from "@/lib/i18n/language-context"
import { SuppressWarnings } from "@/components/app-shell/suppress-warnings"
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
}

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()
  const base = b.canonicalBaseUrl ? new URL(b.canonicalBaseUrl) : undefined
  return {
    metadataBase: base,
    title: {
      default: b.siteTitle ?? b.appName,
      template: `%s | ${b.siteTitle ?? b.appName}`,
    },
    description:
      b.metaDescription ??
      `Professional AI-powered estimates for service businesses | powered by ${b.appName}`,
    openGraph: b.ogImageUrl
      ? { images: [b.ogImageUrl], siteName: b.siteTitle ?? b.appName }
      : undefined,
    icons: {
      icon: b.faviconUrl || b.logoUrl
        ? [{ url: b.faviconUrl ?? b.logoUrl!, type: 'image/png' }]
        : [{ url: '/icons/icon-192.png', type: 'image/png' }],
      apple: [{ url: b.faviconUrl ?? b.logoUrl ?? '/icons/icon-192.png', type: 'image/png' }],
      shortcut: [{ url: '/icons/icon-192.png', type: 'image/png' }],
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const saved = await readThemeCookie()
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col">
        <SuppressWarnings />
        <ThemeProvider
          attribute="class"
          defaultTheme={saved ?? 'dark'}
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
