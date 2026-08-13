'use client'

import { useEffect, useState } from 'react'
import { Wordmark } from '@/components/layout/wordmark'
import { Button } from '@/components/ui/button'
import { useAuthDialog } from '@/features/auth/components/auth-dialog-provider'
import { cn } from '@/utils/cn'

/**
 * Each link lands on the section that demonstrates it, not on a claim about it.
 * ("How it works" used to point at `#how`, a section deleted before launch.)
 */
const LINKS = [
  { label: 'See it work', href: '#engine' },
  { label: 'Features', href: '#capabilities' },
  { label: 'How it works', href: '#visuals' },
  { label: 'Product', href: '#product' },
] as const

/** Far enough that the condense reads as a response to scrolling, not to a twitch. */
const CONDENSE_AT = 24

export function Nav() {
  const { open } = useAuthDialog()
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > CONDENSE_AT)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-200 ease-contour',
        // Transparent by default so the contour field runs under it unbroken;
        // the border is always present so condensing never shifts the page 1px.
        condensed ? 'border-line bg-paper/85 backdrop-blur-xl' : 'border-transparent bg-transparent'
      )}
    >
      <div className="mkt-pad mx-auto flex w-full max-w-[1280px] items-center justify-between py-4">
        <Wordmark href="/" />

        <div className="flex items-center gap-7">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden text-body text-text2 no-underline transition-colors duration-150 ease-contour hover:text-ink md:inline"
            >
              {link.label}
            </a>
          ))}
          <button
            type="button"
            onClick={() => open('signin')}
            className="rounded-xs text-body text-text2 transition-colors duration-150 ease-contour hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
          >
            Sign in
          </button>
          <Button size="sm" onClick={() => open('signup')}>
            Start free
          </Button>
        </div>
      </div>
    </nav>
  )
}
