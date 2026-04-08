import type { Metadata } from 'next'
import { Nav } from '@/components/marketing/Nav'
import { Hero } from '@/components/marketing/Hero'
import { SocialProof } from '@/components/marketing/SocialProof'
import { Features } from '@/components/marketing/Features'
import { HowItWorks } from '@/components/marketing/HowItWorks'
import { DashboardPreview } from '@/components/marketing/DashboardPreview'
import { FeaturesDeepDive } from '@/components/marketing/FeaturesDeepDive'
import { Pricing } from '@/components/marketing/Pricing'
import { CtaSection } from '@/components/marketing/CtaSection'
import { Footer } from '@/components/marketing/Footer'

export const metadata: Metadata = {
  title: 'Kontuur — AI-powered social media for agencies',
  description:
    'Generate, review, schedule and analyse Instagram content for all your clients from one place. Built for marketing agencies.',
  openGraph: {
    title: 'Kontuur',
    description: 'AI-powered social media management for agencies.',
    url: 'https://kontuur.app',
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
      <Pricing />
      <CtaSection />
      <Footer />
    </div>
  )
}
