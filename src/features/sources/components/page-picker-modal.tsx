'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PageGroupList } from '@/features/sources/components/page-group-list'

interface PagePickerModalProps {
  open: boolean
  onClose: () => void
  pages: string[]
  loading: boolean
  initialSelected: string[]
  siteOrigin: string
  onSave: (selected: string[]) => void
}

export function PagePickerModal({
  open,
  onClose,
  pages,
  loading,
  initialSelected,
  siteOrigin,
  onSave,
}: PagePickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [filter, setFilter] = useState('')

  // Reset selection each time the modal opens (render-phase state adjustment)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setSelected(new Set(initialSelected))
      setFilter('')
    }
  }

  function handleToggle(urls: string[], nextChecked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const url of urls) {
        if (nextChecked) next.add(url)
        else next.delete(url)
      }
      return next
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Select pages" className="max-w-xl">
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="md" />
          <p className="text-body text-text3">Scanning website for pages...</p>
        </div>
      ) : pages.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-body text-text3">We couldn&apos;t find pages automatically.</p>
          <p className="text-caption text-text3 mt-1">
            You can still use the site&apos;s homepage as a source.
          </p>
        </div>
      ) : (
        <>
          <p className="text-body text-text2 mb-3">
            Found {pages.length} pages on {siteOrigin.replace(/^https?:\/\//, '')}. Pick the
            sections worth reading — or use the whole site.
          </p>

          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter pages..."
            className="w-full px-3 py-2 text-lead md:text-body text-ink placeholder:text-text3 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-line2 mb-3"
          />

          <PageGroupList
            pages={pages}
            selected={selected}
            onToggle={handleToggle}
            siteOrigin={siteOrigin}
            filter={filter}
            maxHeightClass="max-h-[40vh]"
          />

          <div className="flex items-center justify-between mt-4">
            <span className="text-caption text-text3">
              {selected.size === 0 ? 'Whole site' : `${selected.size} pages selected`}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => onSave([...selected])}>
                {selected.size === 0 ? 'Use whole site' : 'Save selection'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
