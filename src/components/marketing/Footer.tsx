'use client'
import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
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
    <footer
      className="mkt-pad"
      style={{
        background: 'var(--color-brand)',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        paddingTop: 64,
        paddingBottom: 40,
      }}
    >
      {/* Link columns — centered */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: isSmall ? 32 : isMobile ? 48 : 80,
          flexWrap: 'wrap',
          marginBottom: 48,
        }}
      >
        {columns.map((col) => (
          <div key={col.title}>
            <p
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.25)',
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {col.title}
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    style={{
                      fontSize: 13.5,
                      color: 'rgba(255,255,255,0.55)',
                      textDecoration: 'none',
                      transition: 'color 120ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                    }}
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
      <div
        style={{
          borderTop: '0.5px solid rgba(255,255,255,0.08)',
          paddingTop: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
          © {new Date().getFullYear()} Kontuur. All rights reserved.
        </p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
          Built by About Social Media
        </p>
      </div>
    </footer>
  )
}
