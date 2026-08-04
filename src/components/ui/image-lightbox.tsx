'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { Download } from 'lucide-react'
import { downloadImageFile } from '@/lib/download-image'

/** Fullscreen click-to-close overlay for inspecting an image at large size. */
export function ImageLightbox({
  src,
  alt,
  caption,
  width = 1024,
  height = 1024,
  onClose,
}: {
  src: string
  alt: string
  caption?: string
  /** Intrinsic dimensions for next/image; display is responsive. */
  width?: number
  height?: number
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  // Where focus goes back to. Captured on mount, before focus moves into the overlay.
  const openerRef = useRef<Element | null>(null)

  // A dismissible layer that only closes on click is unreachable by keyboard, and focus left
  // behind it lands on controls the overlay covers. Both are dropped on unmount.
  useEffect(() => {
    openerRef.current = document.activeElement
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [onClose])

  return (
    // Above the modal layer (z-50) on purpose: a lightbox is opened *from* dialogs.
    // role="dialog": page-level shortcut handlers (the review flow's keys) suspend
    // themselves while a [role="dialog"] is open — without it they keep firing under here.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center bg-ink/[0.72] p-6"
    >
      <div className="w-full max-w-[520px]">
        <div className="relative">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="block h-auto w-full rounded-lg"
          />
          <button
            ref={closeRef}
            type="button"
            title="Download image"
            onClick={(event) => {
              event.stopPropagation()
              void downloadImageFile(src)
            }}
            className={[
              'absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-sm px-3 py-2',
              'bg-surface/[0.88] text-micro font-medium text-text2 shadow-card',
              'transition-colors duration-150 ease-contour hover:bg-surface hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring',
            ].join(' ')}
          >
            <Download className="size-3.5" />
            Download
          </button>
        </div>
        {caption && (
          <p className="mt-2.5 text-center text-body font-medium text-surface">{caption}</p>
        )}
      </div>
    </div>
  )
}
