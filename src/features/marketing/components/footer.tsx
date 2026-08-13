import Link from 'next/link'
import { Wordmark } from '@/components/layout/wordmark'

/**
 * Every link here resolves. The footer this replaced carried nine, of which
 * seven were `href="#"` — a Changelog, a Roadmap, an About, a Blog, a Contact
 * and a Cookie policy that do not exist. A dead link is a claim the product
 * makes and cannot keep, so the columns are gone and what remains is real.
 *
 * Shared with the three legal pages under `app/(marketing)/`.
 */
const LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Data deletion', href: '/data-deletion' },
] as const

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mkt-pad mx-auto flex w-full max-w-[1140px] flex-wrap items-center justify-between gap-5 py-9">
        <Wordmark href="/" />

        <nav className="flex flex-wrap items-center gap-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-caption text-text3 no-underline transition-colors duration-150 ease-contour hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="mailto:hello@kontuur.app"
            className="text-caption text-text3 no-underline transition-colors duration-150 ease-contour hover:text-ink"
          >
            hello@kontuur.app
          </a>
        </nav>
      </div>

      <div className="mkt-pad mx-auto flex w-full max-w-[1140px] flex-wrap items-center justify-between gap-2 border-t border-line py-5">
        <p className="text-caption text-text3">
          © {new Date().getFullYear()} Kontuur. Operated by Chelling Ltd, UIC 206770508, Sofia,
          Bulgaria.
        </p>
        <p className="text-caption text-text3">Built by About Social Media</p>
      </div>
    </footer>
  )
}
