'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import type { CarouselSlide } from '@/types/api'

interface CarouselSlidesProps {
  slides: CarouselSlide[]
  editable?: boolean
  onSlidesChange?: (slides: CarouselSlide[]) => void
}

/** Inline text field that switches between display and edit on click */
function EditableField({
  value,
  onChange,
  multiline,
  className,
  editClassName,
}: {
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  className?: string
  editClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      if (multiline && ref.current instanceof HTMLTextAreaElement) {
        ref.current.style.height = 'auto'
        ref.current.style.height = `${ref.current.scrollHeight}px`
      }
    }
  }, [editing, multiline])

  function commit() {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  if (!editing) {
    return (
      <p
        onClick={() => setEditing(true)}
        className={cn(
          className,
          'cursor-text rounded px-1 -mx-1 hover:bg-white hover:ring-1 hover:ring-gray-200 transition-all'
        )}
      >
        {value}
      </p>
    )
  }

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          editClassName ?? className,
          'w-full border border-gray-300 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent resize-none'
        )}
      />
    )
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className={cn(
        editClassName ?? className,
        'w-full border border-gray-300 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-transparent'
      )}
    />
  )
}

export function CarouselSlides({ slides, editable, onSlidesChange }: CarouselSlidesProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = slides[activeIndex]

  function handleCopyAll() {
    const text = slides
      .map(
        (s, i) =>
          `Slide ${s.slide_number ?? i + 1}\n${s.headline}${s.body ? `\n${s.body}` : ''}${s.cta_text ? `\n${s.cta_text}` : ''}`
      )
      .join('\n---\n')
    void navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  function updateSlideField(field: 'headline' | 'body', value: string) {
    if (!onSlidesChange) return
    const updated = slides.map((s, i) =>
      i === activeIndex ? { ...s, [field]: value } : s
    )
    onSlidesChange(updated)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Carousel · {slides.length} slides
        </span>
        <button
          onClick={handleCopyAll}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          Copy all slides
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {slides.map((slide, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeIndex === i
                ? 'bg-brand-purple-light text-brand-purple'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {slide.slide_number ?? i + 1}
          </button>
        ))}
      </div>

      {/* Active slide content */}
      {activeSlide && (
        <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-3">
          {activeSlide.slide_role && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase">
                {activeSlide.slide_role}
              </span>
            </div>
          )}

          {editable && onSlidesChange ? (
            <EditableField
              value={activeSlide.headline}
              onChange={(v) => updateSlideField('headline', v)}
              className="text-sm font-semibold text-gray-900"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">{activeSlide.headline}</p>
          )}

          {editable && onSlidesChange && activeSlide.body ? (
            <EditableField
              value={activeSlide.body}
              onChange={(v) => updateSlideField('body', v)}
              multiline
              className="text-sm text-gray-700 whitespace-pre-wrap"
            />
          ) : (
            activeSlide.body && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{activeSlide.body}</p>
            )
          )}

          {activeSlide.cta_text && (
            <p className="text-xs font-medium text-brand-purple">→ {activeSlide.cta_text}</p>
          )}

          {activeSlide.design_note && (
            <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">
              {activeSlide.design_note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
