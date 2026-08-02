'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, Upload, Check, Download, Sparkles, Pencil } from 'lucide-react'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import { downloadImageFile } from '@/lib/download-image'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'
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
export function ImageSlot({ postId, position, image, onUploaded, onDeleted, canvaConnected, onGenerate, generating, composing, onEdit }: ImageSlotProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (generating || composing) {
    return <GeneratingCard label={composing ? 'Adding text…' : image ? 'Regenerating visual…' : 'Generating visual…'} />
  }

  if (image) {
    return <ImageCard image={image} onDelete={() => handleDelete(image.id)} onRegenerate={onGenerate} onEdit={onEdit} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <DropZone
        dragOver={dragOver}
        uploading={uploading}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) void handleFile(e.target.files[0]!) }}
      />

      {onGenerate && (
        <button
          type="button"
          onClick={onGenerate}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '7px 8px',
            border: '1px solid var(--line2)',
            borderRadius: 8,
            background: 'rgba(46,158,104,0.04)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--spring-text)',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(46,158,104,0.10)'
            e.currentTarget.style.borderColor = 'var(--spring-text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(46,158,104,0.04)'
            e.currentTarget.style.borderColor = 'var(--line2)'
          }}
        >
          <Sparkles style={{ width: 12, height: 12 }} />
          Generate with AI
        </button>
      )}

      {canvaConnected && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '7px 8px',
            border: '1px solid var(--line2)',
            borderRadius: 8,
            background: 'var(--sunken)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--forest)',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--wash)'
            e.currentTarget.style.borderColor = 'var(--forest)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--sunken)'
            e.currentTarget.style.borderColor = 'var(--line2)'
          }}
        >
          <Download style={{ width: 12, height: 12 }} />
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
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      disabled={uploading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '16px 12px',
        border: `1.5px dashed ${dragOver ? 'var(--spring-text)' : 'rgba(15,21,18,0.20)'}`,
        borderRadius: 10,
        background: dragOver ? 'rgba(46,158,104,0.04)' : 'rgba(15,21,18,0.02)',
        cursor: uploading ? 'wait' : 'pointer',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {uploading ? (
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>Uploading...</span>
      ) : (
        <>
          <Upload style={{ width: 16, height: 16, color: 'var(--text2)' }} />
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            Drop file here or click to upload
          </span>
          <span style={{ fontSize: 10, color: 'rgba(15,21,18,0.35)' }}>
            JPEG or PNG, ≤ 8 MB
          </span>
        </>
      )}
    </button>
  )
}

function GeneratingCard({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 12px',
        border: '1.5px dashed rgba(46,158,104,0.45)',
        borderRadius: 10,
        background: 'rgba(46,158,104,0.04)',
      }}
    >
      <Sparkles style={{ width: 14, height: 14, color: 'var(--spring-text)' }} className="animate-pulse" />
      <span style={{ fontSize: 11, color: 'var(--spring-text)' }}>{label}</span>
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
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        border: 'none',
        background: 'rgba(255,255,255,0.88)',
        boxShadow: '0 1px 4px rgba(15,21,18,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color,
      }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Uncropped preview (capped width so a 1:1 visual stays ~280px tall); click for full size */}
      <div
        style={{
          position: 'relative',
          maxWidth: 280,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--line)',
        }}
      >
        <button
          type="button"
          title="View full size"
          onClick={() => setViewing(true)}
          style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
        >
          <Image
            src={image.publicUrl}
            alt={image.fileName ?? 'Post image'}
            width={512}
            height={512}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </button>

        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
          {onRegenerate && (
            <OverlayAction title="Regenerate with AI" color="var(--spring-text)" onClick={onRegenerate}>
              <Sparkles style={{ width: 13, height: 13 }} />
            </OverlayAction>
          )}
          {onEdit && (
            <OverlayAction title="Edit text overlay" color="var(--text2)" onClick={onEdit}>
              <Pencil style={{ width: 13, height: 13 }} />
            </OverlayAction>
          )}
          <OverlayAction
            title="Download image"
            color="var(--text2)"
            onClick={() => void downloadImageFile(image.publicUrl, image.fileName ?? undefined)}
          >
            <Download style={{ width: 13, height: 13 }} />
          </OverlayAction>
          <OverlayAction title="Remove image" color="var(--text2)" onClick={onDelete}>
            <X style={{ width: 13, height: 13 }} />
          </OverlayAction>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Check style={{ width: 10, height: 10, color: 'var(--spring-text)' }} />
        <span style={{ fontSize: 10, color: 'var(--spring-text)' }}>
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
    <div
      style={{
        fontSize: 11,
        color: 'var(--danger)',
        background: 'var(--danger-bg)',
        padding: '7px 10px',
        borderRadius: 6,
      }}
    >
      {message}
    </div>
  )
}
