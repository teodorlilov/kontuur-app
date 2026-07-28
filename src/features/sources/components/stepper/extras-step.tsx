'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { uploadSource, upsertTavilySource } from '@/features/sources/actions/source-actions'
import type { TavilyConfig } from '@/types/sources'

interface ExtrasStepProps {
  clientId: string
  webSearchEnabled: boolean
  webSearchIncludeDomains: string[]
  webSearchExcludeDomains: string[]
  onWebSearchConfigChange: (config: {
    enabled: boolean
    includeDomains: string[]
    excludeDomains: string[]
  }) => void
  onDocumentUploaded: (docId: string) => void
  onSourceCreated: (id: string) => void
  onNext: () => void
  onBack: () => void
}

function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase()
  domain = domain.replace(/^https?:\/\//, '')
  domain = domain.replace(/^www\./, '')
  domain = domain.replace(/\/.*$/, '')
  return domain
}

interface DomainListEditorProps {
  label: string
  helper: string
  placeholder: string
  domains: string[]
  onChange: (domains: string[]) => void
  chipClass: string
  removeClass: string
}

function DomainListEditor({
  label,
  helper,
  placeholder,
  domains,
  onChange,
  chipClass,
  removeClass,
}: DomainListEditorProps) {
  const [input, setInput] = useState('')

  function addDomain() {
    const domain = normalizeDomain(input)
    setInput('')
    if (!domain || domains.includes(domain)) return
    onChange([...domains, domain])
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">
        {label} <span className="text-gray-400">(optional)</span>
      </label>
      <p className="text-xs text-gray-400">{helper}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDomain()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
        <Button variant="secondary" size="sm" onClick={addDomain} disabled={!input.trim()}>
          Add
        </Button>
      </div>
      {domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {domains.map((domain) => (
            <span
              key={domain}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${chipClass}`}
            >
              {domain}
              <button
                type="button"
                onClick={() => onChange(domains.filter((d) => d !== domain))}
                className={removeClass}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Optional extras: web-research toggle with advanced site filters, plus reference-document upload. */
export function ExtrasStep({
  clientId,
  webSearchEnabled,
  webSearchIncludeDomains,
  webSearchExcludeDomains,
  onWebSearchConfigChange,
  onDocumentUploaded,
  onSourceCreated,
  onNext,
  onBack,
}: ExtrasStepProps) {
  const [isEnabled, setIsEnabled] = useState(webSearchEnabled)
  const [includes, setIncludes] = useState<string[]>(webSearchIncludeDomains)
  const [excludes, setExcludes] = useState<string[]>(webSearchExcludeDomains)
  const [saving, setSaving] = useState(false)

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

      const result = await uploadSource(clientId, formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onDocumentUploaded(result.data.id)
      setUploadedCount((count) => count + 1)
      toast.success('Document uploaded')
      setFile(null)
      setLabel('')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleContinue() {
    setSaving(true)
    try {
      const config: TavilyConfig = {}
      if (includes.length > 0) config.include_domains = includes
      if (excludes.length > 0) config.exclude_domains = excludes

      const result = await upsertTavilySource(clientId, { is_active: isEnabled, config })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onSourceCreated(result.data.id)
      onWebSearchConfigChange({
        enabled: isEnabled,
        includeDomains: includes,
        excludeDomains: excludes,
      })
      onNext()
    } catch {
      toast.error('Failed to save web research settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Extras (optional)</h3>
        <p className="text-sm text-gray-500 mt-1">
          Fine-tune where ideas come from. Most people skip this.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm font-medium text-gray-900">
          Web research — search the web for trends and news in your industry
        </span>
      </label>

      {isEnabled && (
        <details className="rounded-lg border border-gray-200 px-4 py-3">
          <summary className="text-sm text-gray-600 cursor-pointer select-none">
            Advanced: prefer or block specific sites
          </summary>
          <div className="space-y-4 pt-3">
            <DomainListEditor
              label="Prefer these sites"
              helper="Only return results from these sites."
              placeholder="e.g. example.com"
              domains={includes}
              onChange={setIncludes}
              chipClass="bg-gray-100 text-gray-700"
              removeClass="text-gray-400 hover:text-gray-600"
            />
            <DomainListEditor
              label="Never use these sites"
              helper="Never return results from these sites."
              placeholder="e.g. competitor.com"
              domains={excludes}
              onChange={setExcludes}
              chipClass="bg-red-50 text-red-700"
              removeClass="text-red-400 hover:text-red-600"
            />
          </div>
        </details>
      )}

      <details className="rounded-lg border border-gray-200 px-4 py-3">
        <summary className="text-sm text-gray-600 cursor-pointer select-none">
          Upload reference documents (PDF or TXT)
        </summary>
        <div className="space-y-3 pt-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Service descriptions"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
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
            Upload &amp; extract
          </Button>
          {uploadedCount > 0 && (
            <p className="text-xs text-green-600 font-medium">
              {uploadedCount} document{uploadedCount !== 1 ? 's' : ''} uploaded
            </p>
          )}
        </div>
      </details>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={() => { void handleContinue() }} loading={saving}>
          Continue
        </Button>
      </div>
    </div>
  )
}
