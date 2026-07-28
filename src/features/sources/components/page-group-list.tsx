'use client'

import { useState, useMemo } from 'react'
import { decodeUrl } from '@/utils/decode-url'
import { cn } from '@/utils/cn'

interface PageGroup {
  key: string
  label: string
  urls: string[]
}

interface PageGroupListProps {
  pages: string[]
  selected: Set<string>
  onToggle: (urls: string[], nextChecked: boolean) => void
  siteOrigin: string
  filter: string
  maxHeightClass?: string
}

const COLLAPSE_GROUP_THRESHOLD = 5
const COLLAPSE_PAGE_THRESHOLD = 40

function groupKey(url: string): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean)[0]
    return segment ?? ''
  } catch {
    return ''
  }
}

function buildGroups(pages: string[]): PageGroup[] {
  const byKey = new Map<string, string[]>()
  for (const url of pages) {
    const key = groupKey(url)
    const list = byKey.get(key)
    if (list) list.push(url)
    else byKey.set(key, [url])
  }

  const groups: PageGroup[] = [...byKey.entries()].map(([key, urls]) => ({
    key,
    label: key === '' ? 'Top-level pages' : `/${decodeUrl(key)}`,
    urls,
  }))

  // Top-level pages first, then largest sections
  return groups.sort((a, b) => {
    if (a.key === '') return -1
    if (b.key === '') return 1
    return b.urls.length - a.urls.length
  })
}

/** Grouped, filterable page checklist — groups by first path segment with group-level checkboxes. */
export function PageGroupList({
  pages,
  selected,
  onToggle,
  siteOrigin,
  filter,
  maxHeightClass = 'max-h-[35vh]',
}: PageGroupListProps) {
  const groups = useMemo(() => buildGroups(pages), [pages])

  const collapsedByDefault =
    groups.length > COLLAPSE_GROUP_THRESHOLD || pages.length > COLLAPSE_PAGE_THRESHOLD
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(collapsedByDefault ? [] : groups.map((g) => g.key))
  )

  const query = filter.trim().toLowerCase()

  function displayPath(url: string): string {
    try {
      const parsed = new URL(url)
      return decodeUrl(parsed.pathname + parsed.search)
    } catch {
      return url.replace(siteOrigin, '')
    }
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      urls: query ? group.urls.filter((url) => url.toLowerCase().includes(query)) : group.urls,
    }))
    .filter((group) => group.urls.length > 0)

  if (visibleGroups.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No pages match your filter.</p>
  }

  return (
    <div className={cn('overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50', maxHeightClass)}>
      {visibleGroups.map((group) => {
        const selectedCount = group.urls.filter((url) => selected.has(url)).length
        const allSelected = selectedCount === group.urls.length
        const partiallySelected = selectedCount > 0 && !allSelected
        // Filtering auto-expands groups that contain matches
        const isExpanded = query ? true : expandedKeys.has(group.key)

        return (
          <div key={group.key}>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/60">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = partiallySelected
                }}
                onChange={() => onToggle(group.urls, !allSelected)}
                className="h-4 w-4 rounded border-gray-300 cursor-pointer shrink-0"
              />
              <button
                type="button"
                onClick={() => toggleExpanded(group.key)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span className="text-sm font-medium text-gray-800 truncate">{group.label}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {group.urls.length} page{group.urls.length === 1 ? '' : 's'}
                  {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                </span>
                <svg
                  className={cn(
                    'w-3.5 h-3.5 text-gray-400 ml-auto shrink-0 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {isExpanded &&
              group.urls.map((url) => (
                <label
                  key={url}
                  className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(url)}
                    onChange={() => onToggle([url], !selected.has(url))}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer shrink-0"
                  />
                  <span className="text-sm text-gray-900 truncate" title={url}>
                    {displayPath(url)}
                  </span>
                </label>
              ))}
          </div>
        )
      })}
    </div>
  )
}
