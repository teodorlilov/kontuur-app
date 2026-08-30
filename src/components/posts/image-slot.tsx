'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, Upload, Check, Download, Sparkles, Pencil } from 'lucide-react'
import { mapImageRow } from '@/lib/posts/map-image-row'
import { downloadImageFile } from '@/lib/download-image'
import { validateImageFile } from '@/features/assets/lib/validate-image-file'
import { ImageLightbox } from '@/components/ui/image-lightbox'
import { CanvaDesignPicker } from './canva-design-picker'
import type { PostImage } from '@/types/api'

interface ImageSlotProps {
  postId: string
  position: number
  image: PostImage | null
  onUploaded: (image: PostImage) => void
  onDeleted: (imageId: string) => void
  /** Whether the current user has Canva connected. */
  canvaConnected?: boolean
  /** When provided, the slot offers AI generation (empty slot) / regeneration (filled slot). */
  onGenerate?: () => void
  /** True while this position's visual is being generated — renders the progress state. */
  generating?: boolean
  /** True while the fresh AI image is being auto-composed with text. */
  composing?: boolean
  /** When provided, the filled slot offers the canvas text-overlay editor. */
  onEdit?: () => void
}

/** Single-image upload/display slot for a carousel slide or single post. */
export function ImageSlot({
  postId,
  position,
  image,
  onUploaded,
  onDeleted,
  canvaConnected,
  onGenerate,
  generating,
  composing,
  onEdit,
}: ImageSlotProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (generating || composing) {
    return (
      <GeneratingCard
        label={composing ? 'Adding text…' : image ? 'Regenerating visual…' : 'Generating visual…'}
      />
    )
  }

  if (image) {
    return (
      <ImageCard
        image={image}
        onDelete={() => handleDelete(image.id)}
        onRegenerate={onGenerate}
        onEdit={onEdit}
      />
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <DropZone
        dragOver={dragOver}
        uploading={uploading}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      />
      <input
        className="hidden"
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={(e) => {
          if (e.target.files?.length) void handleFile(e.target.files[0]!)
        }}
      />

      {/* tracking-normal on both buttons: cancels the Label role's built-in 0.16em —
          these are actions read as words, not eyebrows. */}
      {onGenerate && (
        <button
          className="flex cursor-pointer items-center justify-center gap-[5px] rounded-sm border border-line2 bg-spring/4 px-2 py-[7px] text-label font-medium tracking-normal text-spring-text transition-[background,border-color] duration-120 ease-[ease] hover:border-spring-text hover:bg-spring/10"
          type="button"
          onClick={onGenerate}
        >
          <Sparkles className="h-3 w-3" />
          Generate with AI
        </button>
      )}

      {canvaConnected && (
        <button
          className="flex cursor-pointer items-center justify-center gap-[5px] rounded-sm border border-line2 bg-sunken px-2 py-[7px] text-label font-medium tracking-normal text-forest transition-[background,border-color] duration-120 ease-[ease] hover:border-forest hover:bg-wash"
          type="button"
          onClick={() => setPickerOpen(true)}
        >
          <Download className="h-3 w-3" />
          Import from Canva
        </button>
      )}

      {error && <ErrorMessage message={error} />}

      {canvaConnected && (
        <CanvaDesignPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          postId={postId}
          position={position}
          onImported={onUploaded}
        />
      )}
    </div>
  )

  async function handleFile(file: File) {
    const fileError = validateImageFile(file)
    if (fileError) {
      setError(fileError)
      return
    }

    setUploading(true)
    setError(null)

    const form = new FormData()
    form.append('file', file)
    form.append('position', String(position))

    const res = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: form })
    const data = await res.json()

    setUploading(false)

    if (!res.ok) {
      setError(data.error ?? 'Upload failed')
      return
    }

    onUploaded(mapImageRow(data.image))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  async function handleDelete(imageId: string) {
    const res = await fetch(`/api/posts/${postId}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId }),
    })
    if (res.ok) onDeleted(imageId)
  }
}

function DropZone({
  dragOver,
  uploading,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean
  uploading: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-md px-3 py-4 transition-[border-color,background] duration-150 ease-[ease]"
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      disabled={uploading}
      style={{
        border: `1.5px dashed ${dragOver ? 'var(--spring-text)' : 'rgba(15,21,18,0.20)'}`,
        background: dragOver ? 'rgba(46,158,104,0.04)' : 'rgba(15,21,18,0.02)',
        cursor: uploading ? 'wait' : 'pointer',
      }}
    >
      {uploading ? (
        <span className="text-micro text-text2">Uploading...</span>
      ) : (
        <>
          <Upload className="h-4 w-4 text-text2" />
          <span className="text-micro text-text2">Drop file here or click to upload</span>
          {/* tracking-normal: cancels the Label role's built-in 0.16em — a format
              hint reads as a sentence, not an eyebrow. */}
          <span className="text-label tracking-normal text-ink/35">JPEG or PNG, ≤ 8 MB</span>
        </>
      )}
    </button>
  )
}

function GeneratingCard({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-spring/45 bg-spring/4 px-3 py-4">
      <Sparkles className="h-3.5 w-3.5 animate-pulse text-spring-text" />
      <span className="text-micro text-spring-text">{label}</span>
    </div>
  )
}

/** Corner overlay action on the image preview (regenerate / delete). */
function OverlayAction({
  title,
  color,
  onClick,
  children,
}: {
  title: string
  color: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border-0 bg-white/88 shadow-[0_1px_4px_rgba(15,21,18,0.18)]"
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{ color }}
    >
      {children}
    </button>
  )
}

function ImageCard({
  image,
  onDelete,
  onRegenerate,
  onEdit,
}: {
  image: PostImage
  onDelete: () => void
  onRegenerate?: () => void
  onEdit?: () => void
}) {
  const sizeMB = image.fileSize ? (image.fileSize / (1024 * 1024)).toFixed(1) : null
  const [viewing, setViewing] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      {/* Uncropped preview (capped width so a 1:1 visual stays ~280px tall); click for full size */}
      <div className="relative max-w-[280px] overflow-hidden rounded-md border border-line">
        <button
          className="block w-full cursor-zoom-in border-0 bg-transparent p-0"
          type="button"
          title="View full size"
          onClick={() => setViewing(true)}
        >
          <Image
            className="block h-auto w-full"
            src={image.publicUrl}
            alt={image.fileName ?? 'Post image'}
            width={512}
            height={512}
          />
        </button>

        <div className="absolute right-2 top-2 flex gap-1.5">
          {onRegenerate && (
            <OverlayAction
              title="Regenerate with AI"
              color="var(--spring-text)"
              onClick={onRegenerate}
            >
              <Sparkles className="h-[13px] w-[13px]" />
            </OverlayAction>
          )}
          {onEdit && (
            <OverlayAction title="Edit text overlay" color="var(--text2)" onClick={onEdit}>
              <Pencil className="h-[13px] w-[13px]" />
            </OverlayAction>
          )}
          <OverlayAction
            title="Download image"
            color="var(--text2)"
            onClick={() => void downloadImageFile(image.publicUrl, image.fileName ?? undefined)}
          >
            <Download className="h-[13px] w-[13px]" />
          </OverlayAction>
          <OverlayAction title="Remove image" color="var(--text2)" onClick={onDelete}>
            <X className="h-[13px] w-[13px]" />
          </OverlayAction>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Check className="h-2.5 w-2.5 text-spring-text" />
        {/* tracking-normal: cancels the Label role's built-in 0.16em — a status line
            reads as words, not as an eyebrow. */}
        <span className="text-label tracking-normal text-spring-text">
          Uploaded{sizeMB ? ` · ${sizeMB} MB` : ''}
        </span>
      </div>

      {viewing && (
        <ImageLightbox
          src={image.publicUrl}
          alt={image.fileName ?? 'Post image'}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-[6px] bg-danger-bg px-2.5 py-[7px] text-micro text-danger">
      {message}
    </div>
  )
}
