import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'kontuur',
  description: 'AI-powered social media management for agencies',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
