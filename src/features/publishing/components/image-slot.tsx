'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, Upload, Check, Download, Sparkles } from 'lucide-react'
import { mapImageRow } from '@/features/publishing/lib/map-image-row'
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
}

/** Single-image upload/display slot for a carousel slide or single post. */
export function ImageSlot({ postId, position, image, onUploaded, onDeleted, canvaConnected, onGenerate, generating }: ImageSlotProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (generating) {
    return <GeneratingCard replacing={!!image} />
  }

  if (image) {
    return <ImageCard image={image} onDelete={() => handleDelete(image.id)} onRegenerate={onGenerate} />
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
            border: '1px solid var(--color-border-2)',
            borderRadius: 8,
            background: 'rgba(192,123,85,0.04)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            fontWeight: 500,
            color: '#C07B55',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(192,123,85,0.10)'
            e.currentTarget.style.borderColor = '#C07B55'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(192,123,85,0.04)'
            e.currentTarget.style.borderColor = 'var(--color-border-2)'
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
            border: '1px solid var(--color-border-2)',
            borderRadius: 8,
            background: 'rgba(0, 195, 204, 0.04)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            fontWeight: 500,
            color: '#00C3CC',
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 195, 204, 0.10)'
            e.currentTarget.style.borderColor = '#00C3CC'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 195, 204, 0.04)'
            e.currentTarget.style.borderColor = 'var(--color-border-2)'
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
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setError('Only JPEG and PNG files are accepted')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('File must be under 8 MB')
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
        border: `1.5px dashed ${dragOver ? '#C07B55' : 'rgba(44,62,80,0.20)'}`,
        borderRadius: 10,
        background: dragOver ? 'rgba(192,123,85,0.04)' : 'rgba(44,62,80,0.02)',
        cursor: uploading ? 'wait' : 'pointer',
        width: '100%',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {uploading ? (
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Uploading...</span>
      ) : (
        <>
          <Upload style={{ width: 16, height: 16, color: 'var(--color-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            Drop file here or click to upload
          </span>
          <span style={{ fontSize: 10, color: 'rgba(44,62,80,0.35)' }}>
            JPEG or PNG, ≤ 8 MB
          </span>
        </>
      )}
    </button>
  )
}

function GeneratingCard({ replacing }: { replacing: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 12px',
        border: '1.5px dashed rgba(192,123,85,0.45)',
        borderRadius: 10,
        background: 'rgba(192,123,85,0.04)',
      }}
    >
      <Sparkles style={{ width: 14, height: 14, color: '#C07B55' }} className="animate-pulse" />
      <span style={{ fontSize: 11, color: '#C07B55' }}>
        {replacing ? 'Regenerating visual…' : 'Generating visual…'}
      </span>
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
        boxShadow: '0 1px 4px rgba(20,28,34,0.18)',
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

function ImageCard({ image, onDelete, onRegenerate }: { image: PostImage; onDelete: () => void; onRegenerate?: () => void }) {
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
          border: '0.5px solid var(--color-border-1)',
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
            <OverlayAction title="Regenerate with AI" color="#C07B55" onClick={onRegenerate}>
              <Sparkles style={{ width: 13, height: 13 }} />
            </OverlayAction>
          )}
          <OverlayAction title="Remove image" color="#3A4A54" onClick={onDelete}>
            <X style={{ width: 13, height: 13 }} />
          </OverlayAction>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Check style={{ width: 10, height: 10, color: '#5A8A4A' }} />
        <span style={{ fontSize: 10, color: '#5A8A4A' }}>
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
        color: '#A32D2D',
        background: '#FCEBEB',
        padding: '7px 10px',
        borderRadius: 6,
      }}
    >
      {message}
    </div>
  )
}
