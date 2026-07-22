'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import { ImageSlot } from '@/features/publishing/components/image-slot'
import type { CarouselSlide } from '@/types/api'
import type { PostVisualsProps } from './visuals-props'

interface CarouselSlidesProps extends PostVisualsProps {
  slides: CarouselSlide[]
  editable?: boolean
  onSlidesChange?: (slides: CarouselSlide[]) => void
  onBlur?: () => void
  flaggedSlides?: number[]
}

/** Inline text field that switches between display and edit on click */
function EditableField({
  value,
  onChange,
  onBlur: onFieldBlur,
  multiline,
  className,
  editClassName,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
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
    onFieldBlur?.()
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
          'w-full border border-gray-300 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-3)] focus:border-transparent resize-none'
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
        'w-full border border-gray-300 rounded-lg px-2 py-1 -mx-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-3)] focus:border-transparent'
      )}
    />
  )
}

export function CarouselSlides({ slides, editable, onSlidesChange, onBlur, flaggedSlides, postId, images, onImageUploaded, onImageDeleted, canvaConnected, onGenerateImage, generatingPositions, renderImageSlot }: CarouselSlidesProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = slides[activeIndex]

  // Auto-expand the first flagged slide when flaggedSlides is provided
  useEffect(() => {
    if (!flaggedSlides?.length) return
    const idx = slides.findIndex((s) => flaggedSlides.includes(s.slide_number ?? 0))
    if (idx >= 0) setActiveIndex(idx)
  }, [flaggedSlides]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCopyAll() {
    const text = slides
      .map(
        (s, i) =>
          `Slide ${s.slide_number ?? i + 1}\n${s.headline}${s.body ? `\n${s.body}` : ''}`
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
      <div className="flex justify-end">
        <button onClick={handleCopyAll} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Copy all slides</button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {slides.map((slide, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              'px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1',
              activeIndex === i
                ? 'bg-[rgba(44,62,80,0.08)] text-[var(--color-text-1)]'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {slide.slide_number ?? i + 1}
            {flaggedSlides?.includes(slide.slide_number ?? i + 1) && (
              <span
                style={{
                  fontSize: 9,
                  color: '#2C5F8A',
                  background: 'rgba(44,94,138,0.10)',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                Needs update
              </span>
            )}
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
              onBlur={onBlur}
              className="text-sm font-semibold text-gray-900"
            />
          ) : (
            <p className="text-sm font-semibold text-gray-900">{activeSlide.headline}</p>
          )}

          {editable && onSlidesChange && activeSlide.body ? (
            <EditableField
              value={activeSlide.body}
              onChange={(v) => updateSlideField('body', v)}
              onBlur={onBlur}
              multiline
              className="text-sm text-gray-700 whitespace-pre-wrap"
            />
          ) : (
            activeSlide.body && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{activeSlide.body}</p>
            )
          )}


          {renderImageSlot
            ? renderImageSlot(activeIndex)
            : postId && onImageUploaded && onImageDeleted && (
                <ImageSlot
                  postId={postId}
                  position={activeIndex}
                  image={images?.find((img) => img.position === activeIndex) ?? null}
                  onUploaded={onImageUploaded}
                  onDeleted={onImageDeleted}
                  canvaConnected={canvaConnected}
                  onGenerate={onGenerateImage ? () => onGenerateImage(activeIndex) : undefined}
                  generating={generatingPositions?.includes(activeIndex)}
                />
              )}
        </div>
      )}

      {flaggedSlides && flaggedSlides.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#8A8070' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2C5F8A', flexShrink: 0 }} />
          Flagged slides are expanded
        </div>
      )}
    </div>
  )
}
