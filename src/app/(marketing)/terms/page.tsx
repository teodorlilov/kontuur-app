import type { Metadata } from 'next'
import Link from 'next/link'
import { Footer } from '@/features/marketing/components/footer'
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
  title: 'Terms of Service — Kontuur',
  description: 'Terms of Service for Kontuur — AI-powered social media management for agencies.',
}

export default function TermsPage() {
  return (
    <>
      <main className={proseMain}>
        <div className={proseContainer}>
          <Link className={proseBackLink} href="/">
            ← Back
          </Link>
          <p className={proseEyebrow}>Last updated: July 29, 2026</p>
          <h1 className={proseH1}>Terms of Service</h1>
          <p className={proseLead}>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of Kontuur,
            operated by Chelling Ltd (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By creating
            an account or using the platform, you agree to these Terms.
          </p>

          <div className={proseDivider} />

          {/* 1. Service description */}
          <h2 className={proseH2}>1. Service Description</h2>
          <p className={proseP}>
            Kontuur is a SaaS platform that enables marketing agencies and freelancers to generate,
            review, schedule, and analyse social media content for multiple clients from a single
            workspace. The platform integrates with Meta (Instagram and Facebook) to publish and
            retrieve analytics.
          </p>

          {/* 2. Eligibility */}
          <h2 className={proseH2}>2. Eligibility</h2>
          <p className={proseP}>
            You must be at least 18 years old and have the legal authority to enter into a binding
            contract to use Kontuur. If you are accessing the platform on behalf of a company or
            organisation, you represent that you have the authority to bind that entity to these
            Terms.
          </p>

          {/* 3. Accounts */}
          <h2 className={proseH2}>3. Your Account</h2>
          <p className={proseP}>You are responsible for:</p>
          <ul className={proseList}>
            <li>Keeping your login credentials confidential.</li>
            <li>All activity that occurs under your account.</li>
            <li>Notifying us immediately at support@kontuur.io of any unauthorised access.</li>
          </ul>
          <p className={proseP}>
            You must not share your account with others or create multiple accounts to circumvent
            plan limits.
          </p>

          {/* 4. Acceptable use */}
          <h2 className={proseH2}>4. Acceptable Use</h2>
          <p className={proseP}>You agree not to use Kontuur to:</p>
          <ul className={proseList}>
            <li>
              Post content that is illegal, defamatory, harassing, hateful, or infringes third-party
              rights.
            </li>
            <li>Send spam or unsolicited commercial communications.</li>
            <li>
              Attempt to reverse-engineer, scrape, or disrupt the platform or its underlying
              infrastructure.
            </li>
            <li>Use the platform in a way that violates any applicable law or regulation.</li>
          </ul>

          {/* 5. Meta platform compliance */}
          <h2 className={proseH2}>5. Meta Platform Compliance</h2>
          <p className={proseP}>
            Kontuur integrates with the Instagram Graph API and Facebook Marketing API. By
            connecting social accounts, you agree that:
          </p>
          <ul className={proseList}>
            <li>
              You will comply with Meta&apos;s{' '}
              <a
                href="https://www.facebook.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-spring"
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href="https://developers.facebook.com/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-spring"
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
          <p className={proseP}>
            We reserve the right to suspend or terminate your account if we receive a report or have
            reasonable grounds to believe you are violating Meta&apos;s policies.
          </p>

          {/* 6. Subscription and billing */}
          <h2 className={proseH2}>6. Subscription and Billing</h2>
          <p className={proseP}>
            Kontuur is offered on a monthly or annual subscription basis. Fees are charged at the
            start of each billing period and are non-refundable except where required by law.
          </p>
          <p className={proseP}>
            You may cancel your subscription at any time from the Settings page. Cancellation takes
            effect at the end of the current billing period; you retain access until then.
          </p>
          <p className={proseP}>
            We reserve the right to change pricing with 30 days&apos; notice. Continued use after
            the notice period constitutes acceptance of the new pricing.
          </p>

          {/* 7. Intellectual property */}
          <h2 className={proseH2}>7. Intellectual Property</h2>
          <p className={proseP}>
            Content you create or upload remains yours. By using Kontuur, you grant us a limited,
            non-exclusive licence to store, process, and display your content solely to provide the
            service.
          </p>
          <p className={proseP}>
            The Kontuur platform, including its software, design, and trademarks, is owned by
            Chelling Ltd. You may not copy, modify, or distribute any part of the platform without
            our written consent.
          </p>

          {/* 8. Disclaimer */}
          <h2 className={proseH2}>8. Disclaimer of Warranties</h2>
          <p className={proseP}>
            Kontuur is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
            any kind, express or implied. We do not guarantee uninterrupted access, error-free
            operation, or that AI-generated content will meet your expectations. You use the
            platform at your own risk.
          </p>

          {/* 9. Limitation of liability */}
          <h2 className={proseH2}>9. Limitation of Liability</h2>
          <p className={proseP}>
            To the maximum extent permitted by law, Chelling Ltd shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use
            of Kontuur, including but not limited to lost profits, lost data, or social media
            account actions taken on your behalf.
          </p>
          <p className={proseP}>
            Our total liability for direct damages shall not exceed the amount you paid us in the
            three months preceding the claim.
          </p>

          {/* 10. Termination */}
          <h2 className={proseH2}>10. Termination</h2>
          <p className={proseP}>
            We may suspend or terminate your account if you breach these Terms, fail to pay, or if
            we are required to do so by law. You may delete your account at any time from the
            Settings page. Upon termination, your data will be deleted in accordance with our
            Privacy Policy.
          </p>

          {/* 11. Governing law */}
          <h2 className={proseH2}>11. Governing Law</h2>
          <p className={proseP}>
            These Terms are governed by the laws of the Republic of Bulgaria and applicable European
            Union law. Any disputes will be resolved in the courts of Sofia, Bulgaria.
          </p>

          {/* 12. Changes */}
          <h2 className={proseH2}>12. Changes to These Terms</h2>
          <p className={proseP}>
            We may update these Terms from time to time. We will notify you of material changes by
            email or via an in-app notice at least 14 days before the changes take effect. Continued
            use after that date constitutes acceptance.
          </p>

          {/* 13. Contact */}
          <h2 className={proseH2}>13. Contact</h2>
          <p className={proseP}>Questions about these Terms? Contact us at:</p>
          <p className={proseP}>
            <strong>Chelling Ltd</strong>
            <br />
            UIC 206770508, Sofia, Bulgaria
            <br />
            Email:{' '}
            <a href="mailto:legal@kontuur.io" className="text-spring">
              legal@kontuur.io
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
