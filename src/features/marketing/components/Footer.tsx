'use client'
import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Changelog', href: '#' },
      { label: 'Roadmap', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Cookie policy', href: '#' },
    ],
  },
]

export function Footer() {
  const isMobile = useIsMobile()
  const isSmall = useIsMobile(480)

  return (
    <footer className="mkt-pad border-t border-white/8 bg-forest pb-10 pt-16">
      {/* Link columns — centered */}
      <div
        className="mb-12 flex flex-wrap justify-center"
        style={{ gap: isSmall ? 32 : isMobile ? 48 : 80 }}
      >
        {columns.map((col) => (
          <div key={col.title}>
            {/* tracking-[0.1em]: a footer column head; the Label role's 0.16em is
                set for lone UI badges and over-spaces a word this long. */}
            <p className="mb-4 text-label font-semibold uppercase tracking-[0.1em] text-white/25">
              {col.title}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    className="text-body text-white/55 no-underline transition-[color] duration-120 ease-[ease] hover:text-white/85"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-6">
        <p className="m-0 text-body text-white/35">
          © {new Date().getFullYear()} Kontuur. Operated by Chelling Ltd, UIC 206770508, Sofia,
          Bulgaria.
        </p>
        <p className="m-0 text-body text-white/35">Built by About Social Media</p>
      </div>
    </footer>
  )
}
