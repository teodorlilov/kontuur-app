import type { Metadata } from 'next'
import { AuthDialogProvider, type AuthView } from '@/features/auth/components/auth-dialog-provider'
import { Footer } from '@/features/marketing/components/footer'
import { Analytics } from '@/features/marketing/components/landing/analytics'
import { Approvals } from '@/features/marketing/components/landing/approvals'
import { Autopilot } from '@/features/marketing/components/landing/autopilot'
import { Capabilities } from '@/features/marketing/components/landing/capabilities'
import { ClosingCta } from '@/features/marketing/components/landing/closing-cta'
import { Editor } from '@/features/marketing/components/landing/editor'
import { Engine } from '@/features/marketing/components/landing/engine'
import { Hero } from '@/features/marketing/components/landing/hero'
import { Ideas } from '@/features/marketing/components/landing/ideas'
import { Problem } from '@/features/marketing/components/landing/problem'
import { Product } from '@/features/marketing/components/landing/product'
import { SerifMarquee } from '@/features/marketing/components/landing/serif-marquee'
import { Visuals } from '@/features/marketing/components/landing/visuals'
import { Nav } from '@/features/marketing/components/nav'

export const metadata: Metadata = {
  title: 'Kontuur — AI-powered social media for agencies',
  description:
    'Generate, review, schedule and analyse Instagram content for all your clients from one place. Built for marketing agencies.',
  // The card comes from `app/opengraph-image.tsx` — see the note in layout.tsx.
  openGraph: {
    type: 'website',
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
    url: 'https://kontuur.app',
    siteName: 'kontuur',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
  },
}

const AUTH_VIEWS = new Set<AuthView>(['signin', 'signup', 'reset'])

/**
 * What `/auth/callback` can hand back, in words a visitor can act on.
 * The raw param is never shown.
 */
const REDIRECT_ERRORS: Record<string, string> = {
  confirmation_failed:
    'That confirmation link has expired or was already used. Sign in below, or reset your password to get a new one.',
}

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams

  // Read on the server so the dialog is open on first paint. Reading it in the
  // provider instead would mean useSearchParams, and a Suspense boundary around
  // the whole landing page for the sake of one query string.
  const requested = readParam(params.auth)
  const initialView = AUTH_VIEWS.has(requested as AuthView) ? (requested as AuthView) : undefined
  const initialError = REDIRECT_ERRORS[readParam(params.error) ?? '']

  return (
    <AuthDialogProvider initialView={initialView} initialError={initialError}>
      <div className="min-h-screen bg-paper">
        <Nav />
        <Hero />
        <Problem />
        <Capabilities />
        <Engine />
        <SerifMarquee words={['composed', 'approved', 'scheduled', 'published']} />
        <Approvals />
        <Ideas />
        <Autopilot />
        <Product />
        <Visuals />
        <Editor />
        <Analytics />
        <SerifMarquee
          reverse
          words={['no logins', 'no blank pages', 'no missed posts', 'no AI slop']}
        />
        <ClosingCta />
        <Footer />
      </div>
    </AuthDialogProvider>
  )
}
