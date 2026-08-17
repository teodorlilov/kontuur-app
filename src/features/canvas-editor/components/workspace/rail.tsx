'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { ChevronLeft, Image as ImageIcon, Layers, Shapes, Sparkles, Type } from 'lucide-react'
import { cn } from '@/utils/cn'
import { EDITOR_ICON_BUTTON, EDITOR_LABEL, FOCUS_RING } from './chrome'

export type RailSection = 'text' | 'elements' | 'ai' | 'background' | 'layers'

const SECTIONS: Array<{ id: RailSection; label: string; Icon: typeof Type }> = [
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'elements', label: 'Elements', Icon: Shapes },
  { id: 'ai', label: 'AI', Icon: Sparkles },
  { id: 'background', label: 'Image', Icon: ImageIcon },
  { id: 'layers', label: 'Layers', Icon: Layers },
]

const STORAGE_KEY = 'kontuur:editor-rail'

interface RailProps {
  active: RailSection | null
  /** Sections with a model call in flight — the dot is how a closed panel still reports. */
  busy?: RailSection[]
  onSelect: (section: RailSection | null) => void
  children: React.ReactNode
}

/**
 * The insert-oriented left rail and the panel it opens. Sections stay open once chosen — people
 * place several things in a row far more often than one — and which one is open is remembered
 * between sessions.
 */
export function Rail({ active, busy = [], onSelect, children }: RailProps) {
  return (
    <>
      <nav
        aria-label="Editor sections"
        className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-paper py-2"
      >
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            title={busy.includes(id) ? `${label} — working…` : label}
            aria-pressed={active === id}
            onClick={() => onSelect(active === id ? null : id)}
            className={cn(
              'flex w-14 cursor-pointer flex-col items-center gap-0.5 rounded-sm py-1.5',
              'text-text2 transition-colors duration-150 ease-contour hover:bg-ink/[0.05] hover:text-ink',
              FOCUS_RING,
              active === id && 'bg-wash text-forest'
            )}
          >
            <span className="relative">
              <Icon size={16} strokeWidth={1.8} aria-hidden />
              {busy.includes(id) && (
                <span
                  aria-hidden
                  className="live-dot absolute -right-1.5 -top-0.5 size-1.5 rounded-full bg-spring"
                />
              )}
            </span>
            {/* tracking-[0.04em]: the Label role's 0.16em is set for standalone captions and
                pushes "Elements" ~13px past the rail, where it is clipped by the panel. */}
            <span className="text-label tracking-[0.04em]">{label}</span>
          </button>
        ))}
      </nav>

      {active && (
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-paper">
          <div className="flex items-center justify-between px-3 pb-2 pt-3">
            <h2 className={EDITOR_LABEL}>{SECTIONS.find((s) => s.id === active)?.label}</h2>
            <button
              type="button"
              onClick={() => onSelect(null)}
              title="Hide this panel"
              aria-label="Hide this panel"
              className={EDITOR_ICON_BUTTON}
            >
              <ChevronLeft size={15} aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">{children}</div>
        </aside>
      )}
    </>
  )
}

/** Which section was open last time, remembered per browser. */
export function useRailSection(): [RailSection | null, (next: RailSection | null) => void] {
  const stored = useSyncExternalStore(subscribe, readStored, () => 'text' as RailSection | null)
  const set = useCallback((next: RailSection | null) => {
    window.localStorage.setItem(STORAGE_KEY, next ?? '')
    window.dispatchEvent(new Event(STORAGE_KEY))
  }, [])
  return [stored, set]
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(STORAGE_KEY, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(STORAGE_KEY, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readStored(): RailSection | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return 'text'
  return SECTIONS.some((section) => section.id === raw) ? (raw as RailSection) : null
}
