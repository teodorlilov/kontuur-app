import type { Metadata } from 'next'
import { Nav } from '@/components/marketing/Nav'
import { Footer } from '@/components/marketing/Footer'

export const metadata: Metadata = {
  title: 'Terms of Service — Kontuur',
  description:
    'Terms of Service for Kontuur — AI-powered social media management for agencies.',
}

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-playfair)',
  fontSize: 40,
  fontWeight: 700,
  color: 'var(--color-text-1)',
  marginBottom: 8,
  lineHeight: 1.2,
}

const h2Style: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--color-text-1)',
  marginTop: 48,
  marginBottom: 12,
}

const pStyle: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--color-text-2)',
  lineHeight: 1.75,
  marginBottom: 16,
}

const ulStyle: React.CSSProperties = {
  fontSize: 15,
  color: 'var(--color-text-2)',
  lineHeight: 1.75,
  paddingLeft: 20,
  marginBottom: 16,
}

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--color-border-1)',
  marginTop: 48,
  marginBottom: 48,
}

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main style={{ background: 'var(--color-page)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px 100px' }}>
          {/* Header */}
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 16 }}>
            Last updated: April 16, 2025
          </p>
          <h1 style={h1Style}>Terms of Service</h1>
          <p style={{ ...pStyle, fontSize: 16, marginTop: 16 }}>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of Kontuur,
            operated by About Social Media (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By
            creating an account or using the platform, you agree to these Terms.
          </p>

          <div style={dividerStyle} />

          {/* 1. Service description */}
          <h2 style={h2Style}>1. Service Description</h2>
          <p style={pStyle}>
            Kontuur is a SaaS platform that enables marketing agencies and freelancers to generate,
            review, schedule, and analyse social media content for multiple clients from a single
            workspace. The platform integrates with Meta (Instagram and Facebook) to publish and
            retrieve analytics.
          </p>

          {/* 2. Eligibility */}
          <h2 style={h2Style}>2. Eligibility</h2>
          <p style={pStyle}>
            You must be at least 18 years old and have the legal authority to enter into a binding
            contract to use Kontuur. If you are accessing the platform on behalf of a company or
            organisation, you represent that you have the authority to bind that entity to these
            Terms.
          </p>

          {/* 3. Accounts */}
          <h2 style={h2Style}>3. Your Account</h2>
          <p style={pStyle}>You are responsible for:</p>
          <ul style={ulStyle}>
            <li>Keeping your login credentials confidential.</li>
            <li>All activity that occurs under your account.</li>
            <li>Notifying us immediately at support@kontuur.io of any unauthorised access.</li>
          </ul>
          <p style={pStyle}>
            You must not share your account with others or create multiple accounts to circumvent
            plan limits.
          </p>

          {/* 4. Acceptable use */}
          <h2 style={h2Style}>4. Acceptable Use</h2>
          <p style={pStyle}>You agree not to use Kontuur to:</p>
          <ul style={ulStyle}>
            <li>
              Post content that is illegal, defamatory, harassing, hateful, or infringes third-party
              rights.
            </li>
            <li>Send spam or unsolicited commercial communications.</li>
            <li>
              Attempt to reverse-engineer, scrape, or disrupt the platform or its underlying
              infrastructure.
            </li>
            <li>
              Use the platform in a way that violates any applicable law or regulation.
            </li>
          </ul>

          {/* 5. Meta platform compliance */}
          <h2 style={h2Style}>5. Meta Platform Compliance</h2>
          <p style={pStyle}>
            Kontuur integrates with the Instagram Graph API and Facebook Marketing API. By
            connecting social accounts, you agree that:
          </p>
          <ul style={ulStyle}>
            <li>
              You will comply with Meta&apos;s{' '}
              <a
                href="https://www.facebook.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-brand-accent)' }}
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="https://developers.facebook.com/policy/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-brand-accent)' }}
              >
                Platform Policy
              </a>
              .
            </li>
            <li>
              You will only connect accounts for which you have proper authorisation (your own
              accounts or those of clients who have explicitly granted you access).
            </li>
            <li>
              You will not use Kontuur to publish content that violates Meta&apos;s Community
              Standards or Advertising Policies.
            </li>
          </ul>
          <p style={pStyle}>
            We reserve the right to suspend or terminate your account if we receive a report or
            have reasonable grounds to believe you are violating Meta&apos;s policies.
          </p>

          {/* 6. Subscription and billing */}
          <h2 style={h2Style}>6. Subscription and Billing</h2>
          <p style={pStyle}>
            Kontuur is offered on a monthly or annual subscription basis. Fees are charged at the
            start of each billing period and are non-refundable except where required by law.
          </p>
          <p style={pStyle}>
            You may cancel your subscription at any time from the Settings page. Cancellation takes
            effect at the end of the current billing period; you retain access until then.
          </p>
          <p style={pStyle}>
            We reserve the right to change pricing with 30 days&apos; notice. Continued use after
            the notice period constitutes acceptance of the new pricing.
          </p>

          {/* 7. Intellectual property */}
          <h2 style={h2Style}>7. Intellectual Property</h2>
          <p style={pStyle}>
            Content you create or upload remains yours. By using Kontuur, you grant us a limited,
            non-exclusive licence to store, process, and display your content solely to provide the
            service.
          </p>
          <p style={pStyle}>
            The Kontuur platform, including its software, design, and trademarks, is owned by About
            Social Media. You may not copy, modify, or distribute any part of the platform without
            our written consent.
          </p>

          {/* 8. Disclaimer */}
          <h2 style={h2Style}>8. Disclaimer of Warranties</h2>
          <p style={pStyle}>
            Kontuur is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
            any kind, express or implied. We do not guarantee uninterrupted access, error-free
            operation, or that AI-generated content will meet your expectations. You use the platform
            at your own risk.
          </p>

          {/* 9. Limitation of liability */}
          <h2 style={h2Style}>9. Limitation of Liability</h2>
          <p style={pStyle}>
            To the maximum extent permitted by law, About Social Media shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use
            of Kontuur, including but not limited to lost profits, lost data, or social media account
            actions taken on your behalf.
          </p>
          <p style={pStyle}>
            Our total liability for direct damages shall not exceed the amount you paid us in the
            three months preceding the claim.
          </p>

          {/* 10. Termination */}
          <h2 style={h2Style}>10. Termination</h2>
          <p style={pStyle}>
            We may suspend or terminate your account if you breach these Terms, fail to pay, or if
            we are required to do so by law. You may delete your account at any time from the
            Settings page. Upon termination, your data will be deleted in accordance with our
            Privacy Policy.
          </p>

          {/* 11. Governing law */}
          <h2 style={h2Style}>11. Governing Law</h2>
          <p style={pStyle}>
            These Terms are governed by the laws of the European Union and the jurisdiction where
            About Social Media is incorporated. Any disputes will be resolved in the courts of that
            jurisdiction.
          </p>

          {/* 12. Changes */}
          <h2 style={h2Style}>12. Changes to These Terms</h2>
          <p style={pStyle}>
            We may update these Terms from time to time. We will notify you of material changes by
            email or via an in-app notice at least 14 days before the changes take effect. Continued
            use after that date constitutes acceptance.
          </p>

          {/* 13. Contact */}
          <h2 style={h2Style}>13. Contact</h2>
          <p style={pStyle}>
            Questions about these Terms? Contact us at:
          </p>
          <p style={pStyle}>
            <strong>About Social Media</strong>
            <br />
            Email:{' '}
            <a href="mailto:legal@kontuur.io" style={{ color: 'var(--color-brand-accent)' }}>
              legal@kontuur.io
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
