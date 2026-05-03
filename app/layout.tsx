import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { getBranding } from "@/lib/platform-config"
import { readThemeCookie } from "@/lib/theme/cookie"
import { LanguageProvider } from "@/lib/i18n/language-context"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

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
      `Professional AI-powered estimates for service businesses — powered by ${b.appName}`,
    openGraph: b.ogImageUrl
      ? { images: [b.ogImageUrl], siteName: b.siteTitle ?? b.appName }
      : undefined,
    icons: b.faviconUrl ? { icon: b.faviconUrl } : undefined,
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
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme={saved ?? 'dark'}
          enableSystem
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
