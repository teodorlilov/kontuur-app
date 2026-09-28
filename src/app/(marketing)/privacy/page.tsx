import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/features/marketing/components/footer'
import { COMPANY } from '@/utils/constants'
import {
  proseBackLink,
  proseContainer,
  proseDivider,
  proseEyebrow,
  proseH1,
  proseH2,
  proseLead,
  proseList,
  proseMain,
  proseP,
} from '../legal-prose'

export const metadata: Metadata = {
  title: 'Privacy Policy — Kontuur',
  description:
    'Privacy Policy for Kontuur — AI-powered social media management for agencies. Learn how we collect, use, and protect your data.',
}

export default function PrivacyPage() {
  return (
    <>
      <main className={proseMain}>
        <div className={proseContainer}>
          <Link className={proseBackLink} href="/">
            ← Back
          </Link>
          <p className={proseEyebrow}>Last updated: September 27, 2026</p>
          <h1 className={proseH1}>Privacy Policy</h1>
          <p className={proseLead}>
            This Privacy Policy explains how Kontuur, operated by {COMPANY.legalName}{' '}
            (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), collects, uses, and protects your
            information when you use our platform at {COMPANY.domain}.
          </p>

          <div className={proseDivider} />

          {/* 1. Information we collect */}
          <h2 className={proseH2}>1. Information We Collect</h2>
          <p className={proseP}>We collect the following categories of information:</p>
          <ul className={proseList}>
            <li>
              <strong>Account information:</strong> name, email address, and password when you
              register.
            </li>
            <li>
              <strong>Agency and client data:</strong> client names, brand details, and content
              briefs you enter into the platform.
            </li>
            <li>
              <strong>Connected-account access tokens:</strong> OAuth tokens issued by Meta
              (Facebook / Instagram) when you connect accounts to Kontuur, used solely to publish,
              schedule, and retrieve analytics for content you manage through the platform; and, if
              you connect Canva, Canva&apos;s token, used to list and import the designs you choose.
            </li>
            <li>
              <strong>Generated content:</strong> captions, images, and post data created or managed
              within the platform.
            </li>
            <li>
              <strong>Usage data:</strong> pages visited, features used, browser type, IP address,
              and timestamps, collected automatically via server logs.
            </li>
            <li>
              <strong>Billing details:</strong> the name, address, email and VAT number you give at
              checkout.
            </li>
          </ul>

          {/* 2. Meta / Instagram Data */}
          <h2 className={proseH2}>2. Meta and Instagram Data</h2>
          <p className={proseP}>
            When you connect an Instagram or Facebook account, Kontuur requests only the permissions
            required to perform the functions you authorise:
          </p>
          <ul className={proseList}>
            <li>Reading your Instagram business profile and page information.</li>
            <li>Publishing content (photos, videos, captions) on your behalf.</li>
            <li>Retrieving post-level insights and analytics.</li>
            <li>Scheduling content to be published at a future time.</li>
          </ul>
          <p className={proseP}>
            We <strong>do not</strong> access private messages, contacts, or any data beyond what is
            required for the above functions.
          </p>
          <p className={proseP}>
            Meta-derived data (profile details, media, and analytics) is stored securely in our
            database to power the dashboard and reports you see. We{' '}
            <strong>never sell, share, or use this data for advertising purposes</strong>. Access
            tokens are encrypted at rest and in transit.
          </p>
          <p className={proseP}>
            You can revoke Kontuur&apos;s access to your Meta accounts at any time from your
            Facebook Settings &rarr; Apps and Websites. Revoking access will remove the connection
            from Kontuur within 24 hours.
          </p>
          <p className={proseP}>
            To request deletion of all Meta-derived data we hold about you, visit our{' '}
            <a href="/data-deletion" className="text-spring">
              Data Deletion page
            </a>
            .
          </p>

          {/* 3. How we use information */}
          <h2 className={proseH2}>3. How We Use Your Information</h2>
          <ul className={proseList}>
            <li>To provide, maintain, and improve the Kontuur platform.</li>
            <li>To generate AI-powered social media content on your behalf.</li>
            <li>To publish and schedule posts to connected social media accounts.</li>
            <li>To display analytics and performance data in your dashboard.</li>
            <li>To send transactional emails (post approvals, account notifications).</li>
            <li>To respond to support requests and communicate service updates.</li>
            <li>To detect and prevent abuse, fraud, or security incidents.</li>
          </ul>

          {/* 4. Third-party services */}
          <h2 className={proseH2}>4. Third-Party Services</h2>
          <p className={proseP}>
            Kontuur uses the following sub-processors that may have access to your data as necessary
            to provide their services:
          </p>
          <ul className={proseList}>
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
            <li>
              <strong>Stripe</strong> — payments; it collects the card and billing details at
              checkout.
            </li>
            <li>
              <strong>fal.ai</strong> — image generation and editing; it receives the image prompts
              built from your content, and the images you ask it to edit or cut out.
            </li>
            <li>
              <strong>Tavily</strong> — web search for research; it receives search queries.
            </li>
            <li>
              <strong>Canva</strong> — design import, if you connect it; Kontuur lists and exports
              the designs you choose.
            </li>
            <li>
              <strong>Jina AI</strong> — reads a client&apos;s public Instagram profile page when
              you give one while setting up a brand; it receives that profile&apos;s address.
            </li>
          </ul>

          {/* 5. Data retention */}
          <h2 className={proseH2}>5. Data Retention</h2>
          <p className={proseP}>
            When a plan ends the workspace is paused, not deleted: everything stays until an admin
            deletes it in Settings. Invoices and credit notes, with the billing details on them, and
            the payment records Stripe sends us about them are kept for at least ten years, as
            Bulgarian law requires, even after the workspace is deleted.
          </p>
          <p className={proseP}>
            You can delete your workspace yourself from Settings, which removes everything in it at
            once except the invoices, credit notes and payment records described above, or request
            deletion by contacting us at the address below; we process requests within 30 days.
          </p>

          {/* 6. Data security */}
          <h2 className={proseH2}>6. Data Security</h2>
          <p className={proseP}>
            We implement industry-standard security measures including encrypted storage, HTTPS
            transport, and access controls. OAuth tokens are stored encrypted and scoped to the
            minimum permissions required. Despite these measures, no transmission over the internet
            is 100% secure.
          </p>

          {/* 7. GDPR rights */}
          <h2 className={proseH2}>7. Your Rights (GDPR)</h2>
          <p className={proseP}>
            If you are located in the European Economic Area, you have the following rights
            regarding your personal data:
          </p>
          <ul className={proseList}>
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
          <p className={proseP}>
            To exercise any of these rights, contact us at{' '}
            <a href={`mailto:privacy@${COMPANY.domain}`} className="text-spring">
              privacy@{COMPANY.domain}
            </a>
            .
          </p>

          {/* 8. Cookies */}
          <h2 className={proseH2}>8. Cookies</h2>
          <p className={proseP}>
            Kontuur uses only strictly necessary cookies for session management and authentication.
            We do not use advertising or tracking cookies. A full cookie policy is available on
            request.
          </p>

          {/* 9. Changes */}
          <h2 className={proseH2}>9. Changes to This Policy</h2>
          <p className={proseP}>
            We may update this Privacy Policy from time to time. When we do, we will update the
            &quot;Last updated&quot; date above and notify active users by email if the changes are
            material.
          </p>

          {/* 10. Contact */}
          <h2 className={proseH2}>10. Contact</h2>
          <p className={proseP}>For privacy-related questions or requests, please contact:</p>
          <p className={proseP}>
            <strong>{COMPANY.legalName}</strong>
            <br />
            UIC {COMPANY.uic}, {COMPANY.address}
            <br />
            Email:{' '}
            <a href={`mailto:privacy@${COMPANY.domain}`} className="text-spring">
              privacy@{COMPANY.domain}
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
