import type { Metadata } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
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

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500'],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              border: '0.5px solid #EAE8E3',
              borderRadius: '10px',
              color: '#1A1918',
              fontSize: '13.5px',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 24px rgba(26,25,24,0.10)',
              padding: '12px 16px',
            },
          }}
        />
      </body>
    </html>
  )
}
