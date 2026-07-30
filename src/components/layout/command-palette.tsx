'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { CornerDownLeft, Search, Sparkles, UserPlus, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getNavItems } from '@/components/layout/nav-items'

interface PaletteEntry {
  id: string
  label: string
  hint: string
  href: string
  icon: LucideIcon
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agencyMode: 'agency' | 'solo'
  clients: Array<{ id: string; name: string }>
}

export function CommandPalette({ open, onOpenChange, agencyMode, clients }: CommandPaletteProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-ink/40 backdrop-blur-[2px] [animation:fade-in_150ms_ease]" />
        {/* Radix unmounts the content when closed, so the search state below is
            always fresh — no reset effect needed. */}
        <PaletteBody onOpenChange={onOpenChange} agencyMode={agencyMode} clients={clients} />
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaletteBody({
  onOpenChange,
  agencyMode,
  clients,
}: Omit<CommandPaletteProps, 'open'>) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<PaletteEntry[]>(() => {
    const navEntries = getNavItems(agencyMode).map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      hint: 'Go to',
      href: item.href,
      icon: item.icon,
    }))
    const clientEntries = clients.map((client) => ({
      id: `client:${client.id}`,
      label: client.name,
      hint: 'Client settings',
      href: `/clients/${client.id}/edit`,
      icon: Search,
    }))
    return [
      ...navEntries,
      ...clientEntries,
      { id: 'action:generate', label: 'Generate posts', hint: 'Action', href: '/generate', icon: Sparkles },
      { id: 'action:add-client', label: 'Add client', hint: 'Action', href: '/clients/new', icon: UserPlus },
    ]
  }, [agencyMode, clients])

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return entries
    return entries.filter((entry) => entry.label.toLowerCase().includes(term))
  }, [entries, query])

  // Clamp during render rather than syncing with an effect: filtering can shrink
  // the list under the highlight.
  const highlighted = Math.min(activeIndex, Math.max(results.length - 1, 0))

  function navigateTo(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length))
      return
    }
    if (event.key === 'Enter') {
      const entry = results[highlighted]
      if (entry) {
        event.preventDefault()
        navigateTo(entry.href)
      }
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[18vh] z-[201] w-[92vw] max-w-[520px] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-frame outline-none [animation:scale-in_180ms_cubic-bezier(0.16,1,0.3,1)]"
        >
          <Dialog.Title className="sr-only">Search Kontuur</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
            <Search size={15} className="shrink-0 text-text3" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              placeholder="Search clients, pages and actions…"
              className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-text3"
            />
            <kbd className="rounded-[5px] border border-line2 px-1.5 py-px text-[9.5px] font-semibold text-text3">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-text3">Nothing matches “{query}”.</p>
            ) : (
              results.map((entry, index) => {
                const Icon = entry.icon
                const isActive = index === highlighted
                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigateTo(entry.href)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-left transition-colors',
                      isActive ? 'bg-wash' : 'bg-transparent'
                    )}
                  >
                    <Icon size={14} className={cn('shrink-0', isActive ? 'text-forest' : 'text-text3')} />
                    <span className="flex-1 truncate text-[13.5px] text-ink">{entry.label}</span>
                    <span className="text-[11px] text-text3">{entry.hint}</span>
                    {isActive && <CornerDownLeft size={12} className="text-text3" />}
                  </button>
                )
              })
            )}
          </div>
    </Dialog.Content>
  )
}
