import type { Metadata } from 'next'
import { Nav } from '@/features/marketing/components/Nav'
import { Hero } from '@/features/marketing/components/Hero'
import { SocialProof } from '@/features/marketing/components/SocialProof'
import { Features } from '@/features/marketing/components/Features'
import { HowItWorks } from '@/features/marketing/components/HowItWorks'
import { DashboardPreview } from '@/features/marketing/components/DashboardPreview'
import { FeaturesDeepDive } from '@/features/marketing/components/FeaturesDeepDive'
import { CtaSection } from '@/features/marketing/components/CtaSection'
import { Footer } from '@/features/marketing/components/Footer'

export const metadata: Metadata = {
  title: 'Kontuur — AI-powered social media for agencies',
  description:
    'Generate, review, schedule and analyse Instagram content for all your clients from one place. Built for marketing agencies.',
  openGraph: {
    type: 'website',
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
    url: 'https://kontuur.app',
    siteName: 'kontuur',
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
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
    images: ['/dashboard.png'],
  },
}

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--color-page)', minHeight: '100vh' }}>
      <Nav />
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <DashboardPreview />
      <FeaturesDeepDive />
      <CtaSection />
      <Footer />
    </div>
  )
}
