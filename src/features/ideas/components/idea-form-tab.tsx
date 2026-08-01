'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormSection, InputAffix } from '@/components/ui/form'
import { StatusPill } from '@/components/ui/status-pill'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { ensureIdeaToken } from '@/features/ideas/actions/token-actions'
import type { ClientIdea } from '@/types/api'

/**
 * The canonical public origin, not `window.location.origin`.
 *
 * This panel server-renders when the page is opened at `?tab=ideas`, where `window` does not
 * exist. It is also the more correct value: the link is handed to the client, so it must be the
 * app's public address rather than whichever host the manager happens to be browsing from.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

interface IdeaFormTabProps {
  clientId: string
  clientName: string
  /** Read server-side. Null when the client has never had a link generated. */
  token: string | null
  totalCount: number
  /** A preview slice, not the full set — use totalCount for any "how many" copy. */
  ideas: ClientIdea[]
}

/** A public link the client can use to send ideas, without an account. */
export function IdeaFormTab({
  clientId,
  clientName,
  token: initialToken,
  totalCount,
  ideas,
}: IdeaFormTabProps) {
  // Seeded from the server and only ever set by the create action below, so there is no
  // prop/state sync: a refresh re-renders with the same value.
  const [token, setToken] = useState(initialToken)
  const [creating, setCreating] = useState(false)

  const formUrl = token ? `${APP_URL}/ideas/${token}` : ''

  async function handleCreate() {
    setCreating(true)
    const result = await ensureIdeaToken(clientId)
    if (result.ok) setToken(result.data)
    else toast.error(result.error)
    setCreating(false)
  }

  if (!token) {
    return (
      <FormSection>
        <div className="col-span-12">
          <p className="mb-3 text-[13px] text-text2">
            No link has been created for {clientName} yet. Creating one lets them submit ideas
            without an account.
          </p>
          <Button size="sm" onClick={handleCreate} loading={creating}>
            Create link
          </Button>
        </div>
      </FormSection>
    )
  }

  return (
    <>
      <FormSection>
        <Field
          label="Share this link"
          hint="Send it once — it doesn't expire."
        >
          <InputAffix
            suffix={
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(formUrl)
                    toast.success('Link copied to clipboard')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-text2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                >
                  <Copy size={13} />
                  Copy
                </button>
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the idea form in a new tab"
                  className="inline-flex items-center rounded-md px-2 py-1 text-text2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                >
                  <ExternalLink size={13} />
                </a>
              </span>
            }
          >
            <Input readOnly value={formUrl} />
          </InputAffix>
        </Field>
      </FormSection>

      <FormSection
        legend="Recent submissions"
        description={
          totalCount > 0
            ? `${totalCount} idea${totalCount === 1 ? '' : 's'} submitted so far.`
            : 'Nothing submitted yet.'
        }
      >
        {ideas.length > 0 && (
          <div className="col-span-12">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className="flex items-center gap-3 border-t border-line py-3 first:border-t-0"
              >
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  &ldquo;{idea.ideaText}&rdquo;
                </p>
                {idea.platform && <StatusPill tone="mark">{idea.platform}</StatusPill>}
                {idea.status === 'new' && <StatusPill tone="ok">New</StatusPill>}
              </div>
            ))}
            <Link
              href="/ideas"
              className="mt-3 inline-block text-[12.5px] font-medium text-forest hover:underline"
            >
              View all ideas &rarr;
            </Link>
          </div>
        )}
      </FormSection>
    </>
  )
}
