import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { getBranding } from "@/lib/platform-config"
import { readThemeCookie } from "@/lib/theme/cookie"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()
  return {
    title: b.appName,
    description: `Professional AI-powered estimates for service businesses — powered by ${b.appName}`,
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
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
