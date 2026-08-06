'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      className="sticky top-0 z-50 flex h-16 items-center justify-between transition-[background,border-color] duration-200 ease-[ease]"
      style={{
        padding: isMobile ? '0 20px' : '0 40px',
        background: scrolled ? 'rgba(249,247,244,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--line)' : '1px solid transparent',
      }}
    >
      <Link href="/" className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kontuur_logo.svg" alt="Kontuur" className="h-12 w-auto" />
      </Link>

      {!isMobile && (
        <div className="flex gap-8">
          {[
            { label: 'Features', href: '#features' },
            { label: 'How it works', href: '#how-it-works' },
          ].map(({ label, href }) => (
            <a
              className="text-body text-text2 no-underline transition-[color] duration-120 ease-[ease] hover:text-ink"
              key={label}
              href={href}
            >
              {label}
            </a>
          ))}
        </div>
      )}

      {/* leading-none: a single-line button label, centred by its own padding. */}
      <Link
        className="inline-flex items-center rounded-sm bg-forest px-4 py-[7px] text-body font-medium leading-none text-white no-underline transition-[background] duration-150 ease-[ease] hover:bg-forest-deep"
        href="/dashboard"
      >
        Log in
      </Link>
    </nav>
  )
}
