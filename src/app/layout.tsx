import type { Metadata } from 'next'
import { Geist, Instrument_Serif } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

// `subsets` does not decide which glyphs ship — next/font/google never sends a
// subset param, so every subset is downloaded and self-hosted either way. It
// decides which files get <link rel=preload>. Half this product's audience is
// Bulgarian, and without cyrillic here their first paint falls back to
// Geist Fallback (local Arial) for one fetch before swapping.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic'],
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
      className={`${geistSans.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {FB_APP_ID && <meta property="fb:app_id" content={FB_APP_ID} />}
        {children}
        {/* Top-right: the app's primary actions live in sticky bottom bars
            (generate's commitment bar, save bars) — a bottom toast covered
            the very button that fired it. */}
        {/* Styled by object, not class: this is sonner's config, and its own base
            rules would win over utility classes where an inline style does not. */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              fontSize: 'var(--text-body)',
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
