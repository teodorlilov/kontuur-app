import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/components/marketing/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy — Kontuur',
  description:
    'Privacy Policy for Kontuur — AI-powered social media management for agencies. Learn how we collect, use, and protect your data.',
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

export default function PrivacyPage() {
  return (
    <>
      <main style={{ background: 'var(--color-page)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px 100px' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
              color: 'var(--color-text-3)',
              textDecoration: 'none',
              marginBottom: 48,
            }}
          >
            ← Back
          </Link>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 16 }}>
            Last updated: April 16, 2025
          </p>
          <h1 style={h1Style}>Privacy Policy</h1>
          <p style={{ ...pStyle, fontSize: 16, marginTop: 16 }}>
            This Privacy Policy explains how Kontuur, operated by About Social Media (&quot;we&quot;,
            &quot;us&quot;, &quot;our&quot;), collects, uses, and protects your information when you use our
            platform at kontuur.io.
          </p>

          <div style={dividerStyle} />

          {/* 1. Information we collect */}
          <h2 style={h2Style}>1. Information We Collect</h2>
          <p style={pStyle}>We collect the following categories of information:</p>
          <ul style={ulStyle}>
            <li>
              <strong>Account information:</strong> name, email address, and password when you
              register.
            </li>
            <li>
              <strong>Agency and client data:</strong> client names, brand details, and content
              briefs you enter into the platform.
            </li>
            <li>
              <strong>Social media access tokens:</strong> OAuth tokens issued by Meta (Facebook /
              Instagram) when you connect accounts to Kontuur. These are used solely to publish,
              schedule, and retrieve analytics for content you manage through the platform.
            </li>
            <li>
              <strong>Generated content:</strong> captions, images, and post data created or
              managed within the platform.
            </li>
            <li>
              <strong>Usage data:</strong> pages visited, features used, browser type, IP address,
              and timestamps, collected automatically via server logs.
            </li>
          </ul>

          {/* 2. Meta / Instagram Data */}
          <h2 style={h2Style}>2. Meta and Instagram Data</h2>
          <p style={pStyle}>
            When you connect an Instagram or Facebook account, Kontuur requests only the permissions
            required to perform the functions you authorise:
          </p>
          <ul style={ulStyle}>
            <li>Reading your Instagram business profile and page information.</li>
            <li>Publishing content (photos, videos, captions) on your behalf.</li>
            <li>Retrieving post-level insights and analytics.</li>
            <li>Scheduling content to be published at a future time.</li>
          </ul>
          <p style={pStyle}>
            We <strong>do not</strong> access private messages, contacts, or any data beyond what is
            required for the above functions.
          </p>
          <p style={pStyle}>
            Meta-derived data (profile details, media, and analytics) is stored securely in our
            database to power the dashboard and reports you see. We{' '}
            <strong>never sell, share, or use this data for advertising purposes</strong>. Access
            tokens are encrypted at rest and in transit.
          </p>
          <p style={pStyle}>
            You can revoke Kontuur&apos;s access to your Meta accounts at any time from your
            Facebook Settings &rarr; Apps and Websites. Revoking access will remove the connection
            from Kontuur within 24 hours.
          </p>
          <p style={pStyle}>
            To request deletion of all Meta-derived data we hold about you, visit our{' '}
            <a href="/data-deletion" style={{ color: 'var(--color-brand-accent)' }}>
              Data Deletion page
            </a>
            .
          </p>

          {/* 3. How we use information */}
          <h2 style={h2Style}>3. How We Use Your Information</h2>
          <ul style={ulStyle}>
            <li>To provide, maintain, and improve the Kontuur platform.</li>
            <li>To generate AI-powered social media content on your behalf.</li>
            <li>To publish and schedule posts to connected social media accounts.</li>
            <li>To display analytics and performance data in your dashboard.</li>
            <li>To send transactional emails (post approvals, account notifications).</li>
            <li>To respond to support requests and communicate service updates.</li>
            <li>To detect and prevent abuse, fraud, or security incidents.</li>
          </ul>

          {/* 4. Third-party services */}
          <h2 style={h2Style}>4. Third-Party Services</h2>
          <p style={pStyle}>
            Kontuur uses the following sub-processors that may have access to your data as necessary
            to provide their services:
          </p>
          <ul style={ulStyle}>
            <li>
              <strong>Supabase</strong> — database and authentication infrastructure. Data is stored
              in EU data centers.
            </li>
            <li>
              <strong>Vercel</strong> — hosting and edge delivery.
            </li>
            <li>
              <strong>Anthropic (Claude AI)</strong> — AI model used to generate content
              suggestions. Content prompts are sent to Anthropic&apos;s API; Anthropic&apos;s
              privacy policy governs their handling of API data.
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery.
            </li>
            <li>
              <strong>Meta Platforms</strong> — the Instagram Graph API and Facebook Marketing API
              used to publish and retrieve data for connected accounts.
            </li>
          </ul>

          {/* 5. Data retention */}
          <h2 style={h2Style}>5. Data Retention</h2>
          <p style={pStyle}>
            We retain your account data for as long as your account is active. Generated posts and
            analytics are retained for the duration of your subscription plus a 30-day grace period
            after cancellation.
          </p>
          <p style={pStyle}>
            You may request deletion of your account and all associated data at any time by
            contacting us at the address below. We will process deletion requests within 30 days.
          </p>

          {/* 6. Data security */}
          <h2 style={h2Style}>6. Data Security</h2>
          <p style={pStyle}>
            We implement industry-standard security measures including encrypted storage, HTTPS
            transport, and access controls. OAuth tokens are stored encrypted and scoped to the
            minimum permissions required. Despite these measures, no transmission over the internet
            is 100% secure.
          </p>

          {/* 7. GDPR rights */}
          <h2 style={h2Style}>7. Your Rights (GDPR)</h2>
          <p style={pStyle}>
            If you are located in the European Economic Area, you have the following rights regarding
            your personal data:
          </p>
          <ul style={ulStyle}>
            <li>
              <strong>Access:</strong> request a copy of the personal data we hold about you.
            </li>
            <li>
              <strong>Rectification:</strong> request correction of inaccurate data.
            </li>
            <li>
              <strong>Erasure:</strong> request deletion of your data.
            </li>
            <li>
              <strong>Portability:</strong> receive your data in a structured, machine-readable
              format.
            </li>
            <li>
              <strong>Restriction / objection:</strong> restrict or object to certain processing
              activities.
            </li>
          </ul>
          <p style={pStyle}>
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:privacy@kontuur.io" style={{ color: 'var(--color-brand-accent)' }}>
              privacy@kontuur.io
            </a>
            .
          </p>

          {/* 8. Cookies */}
          <h2 style={h2Style}>8. Cookies</h2>
          <p style={pStyle}>
            Kontuur uses only strictly necessary cookies for session management and authentication.
            We do not use advertising or tracking cookies. A full cookie policy is available on
            request.
          </p>

          {/* 9. Changes */}
          <h2 style={h2Style}>9. Changes to This Policy</h2>
          <p style={pStyle}>
            We may update this Privacy Policy from time to time. When we do, we will update the
            &quot;Last updated&quot; date above and notify active users by email if the changes are
            material.
          </p>

          {/* 10. Contact */}
          <h2 style={h2Style}>10. Contact</h2>
          <p style={pStyle}>
            For privacy-related questions or requests, please contact:
          </p>
          <p style={pStyle}>
            <strong>About Social Media</strong>
            <br />
            Email:{' '}
            <a href="mailto:privacy@kontuur.io" style={{ color: 'var(--color-brand-accent)' }}>
              privacy@kontuur.io
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
