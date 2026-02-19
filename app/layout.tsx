import React from "react"
import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { headers } from 'next/headers'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})

const DEFAULT_TITLE = 'Xtimator - Estimativas Profissionais'
const DEFAULT_DESCRIPTION = 'Crie orcamentos profissionais em minutos com IA'

function getFirstHeaderValue(value: string | null): string | null {
  if (!value) return null
  return value.split(',')[0]?.trim() ?? null
}

function getBaseUrlFromHeaders(headersList: Headers): URL {
  const forwardedHost = getFirstHeaderValue(headersList.get('x-forwarded-host'))
  const host = forwardedHost ?? headersList.get('host') ?? 'localhost:3000'
  const forwardedProto = getFirstHeaderValue(headersList.get('x-forwarded-proto'))
  const isLocalHost =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]')
  const protocol = forwardedProto ?? (isLocalHost ? 'http' : 'https')
  return new URL(`${protocol}://${host}`)
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const baseUrl = getBaseUrlFromHeaders(headersList)
  const facebookAppId = process.env.FACEBOOK_APP_ID ?? process.env.NEXT_PUBLIC_FACEBOOK_APP_ID

  return {
    metadataBase: baseUrl,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    alternates: {
      canonical: '/',
    },
    openGraph: {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      type: 'website',
      siteName: 'Xtimator',
      url: '/',
    },
    twitter: {
      card: 'summary_large_image',
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    },
    ...(facebookAppId ? { facebook: { appId: facebookAppId } } : {}),
    manifest: '/manifest.json',
    icons: {
      icon: [
        {
          url: '/icon-light-32x32.png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/icon-dark-32x32.png',
          media: '(prefers-color-scheme: dark)',
        },
        {
          url: '/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      apple: '/apple-icon.png',
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#7C3AED',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background">
      <body className={`${plusJakartaSans.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
