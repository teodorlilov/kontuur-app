import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Instrument Serif ships no Cyrillic glyphs, so serif type is reserved for
// Latin chrome. Anything interpolating user data gates on hasCyrillic().
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://kontuur.app'),
  title: 'kontuur',
  description: 'AI-powered social media management for agencies',
  openGraph: {
    type: 'website',
    url: 'https://kontuur.app',
    siteName: 'kontuur',
    title: 'kontuur',
    description: 'AI-powered social media management for agencies',
    images: [
      {
        url: '/dashboard.png',
        width: 1200,
        height: 630,
        alt: 'kontuur — AI-powered social media management for agencies',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'kontuur',
    description: 'AI-powered social media management for agencies',
    images: ['/dashboard.png'],
  },
}

// Facebook only recognizes fb:app_id via the `property` attribute, which the
// Next.js Metadata `other` field can't emit (it always uses `name`). Render it
// directly so React 19 hoists it into <head> with the correct attribute.
const FB_APP_ID = process.env.META_APP_ID ?? ''

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {FB_APP_ID && <meta property="fb:app_id" content={FB_APP_ID} />}
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              fontSize: '13.5px',
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--sh-pop)',
              padding: '12px 16px',
            },
          }}
        />
      </body>
    </html>
  )
}
