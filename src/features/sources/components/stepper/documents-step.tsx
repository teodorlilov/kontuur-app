'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

interface DocumentsStepProps {
  clientId: string
  onUploaded: (docId: string) => void
  onSkip: () => void
  onNext: () => void
  onBack: () => void
}

export function DocumentsStep({
  clientId,
  onUploaded,
  onSkip,
  onNext,
  onBack,
}: DocumentsStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedCount, setUploadedCount] = useState(0)

  async function handleUpload() {
    if (!file || !label.trim()) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('label', label.trim())

      const res = await fetch(`/api/clients/${clientId}/sources/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as { source?: { id: string }; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed')
        return
      }
      if (data.source) {
        onUploaded(data.source.id)
        setUploadedCount((c) => c + 1)
        toast.success('Document uploaded')
      }
      setFile(null)
      setLabel('')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Documents</h3>
        <p className="text-sm text-gray-500 mt-1">
          Upload PDFs or text files with client information the AI should reference.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Service descriptions"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">File (PDF or TXT)</label>
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
        </div>
        <p className="text-xs text-gray-500">
          Max 10MB. Text will be extracted and used as context for research and generation.
        </p>
        <Button
          size="sm"
          onClick={() => { void handleUpload() }}
          loading={uploading}
          disabled={!file || !label.trim()}
        >
          Upload & extract
        </Button>
      </div>

      {uploadedCount > 0 && (
        <p className="text-xs text-green-600 font-medium">
          {uploadedCount} document{uploadedCount !== 1 ? 's' : ''} uploaded
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip for now
          </button>
          <Button size="sm" onClick={onNext}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
