'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0 40px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 200ms ease, border-color 200ms ease',
        background: scrolled ? 'rgba(249,247,244,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '0.5px solid var(--color-border-1)' : '0.5px solid transparent',
      }}
    >
      <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kontuur_logo.svg" alt="Kontuur" style={{ height: 26, width: 'auto' }} />
      </Link>

      <div style={{ display: 'flex', gap: 32 }}>
        {[
          { label: 'Features', href: '#features' },
          { label: 'How it works', href: '#how-it-works' },
          { label: 'Pricing', href: '#pricing' },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            style={{ fontSize: 14, color: 'var(--color-text-2)', textDecoration: 'none', transition: 'color 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-2)' }}
          >
            {label}
          </a>
        ))}
      </div>

      <Link
        href="/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '7px 16px',
          background: 'var(--color-brand)',
          color: '#fff',
          borderRadius: 8,
          fontSize: 13.5,
          fontWeight: 500,
          textDecoration: 'none',
          lineHeight: 1,
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-brand-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-brand)' }}
      >
        Log in
      </Link>
    </nav>
  )
}
