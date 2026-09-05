'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { connectFacebookPage } from '@/features/clients/actions/connection-actions'
import { ServiceTile } from '@/components/ui/service-row'
import { cn } from '@/utils/cn'
import type { FacebookPage } from '@/lib/meta/facebook-auth'

/** Publishing needs this task on the Page; a person can administer one without it. */
const CREATE_CONTENT = 'CREATE_CONTENT'

interface FacebookPageChooserProps {
  clientId: string
  /** Loaded by the page when the callback returns with `?choose_page=1`. */
  pages: FacebookPage[]
  onClose: () => void
}

/**
 * Which Page this client publishes to.
 *
 * Instagram's consent names the account it connects, so there is nothing to pick. Facebook's
 * yields a token that reaches every Page the person administers, which is why connecting is two
 * steps and why this exists at all.
 *
 * A Page missing `CREATE_CONTENT` is shown and refused rather than hidden: "my Page isn't in the
 * list" is a worse thing to debug than a Page that says why it cannot be used.
 */
export function FacebookPageChooser({ clientId, pages, onClose }: FacebookPageChooserProps) {
  const router = useRouter()
  const [connecting, setConnecting] = useState<string | null>(null)

  async function handleConnect(pageId: string) {
    setConnecting(pageId)
    try {
      const result = await connectFacebookPage(clientId, pageId)
      if (!result.ok) throw new Error(result.error)
      toast.success('Facebook Page connected')
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not connect that Page')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <Modal open onClose={onClose} title="Choose a Facebook Page">
      {pages.length === 0 ? (
        <p className="text-body text-text2">
          No Pages came back for your Facebook account. You need to administer at least one Page —
          then start the connection again.
        </p>
      ) : (
        <ul className="flex flex-col">
          {pages.map((page) => {
            const canPublish = page.tasks.includes(CREATE_CONTENT)
            return (
              <li
                key={page.id}
                className={cn(
                  'flex items-center gap-3.5 border-t border-line py-[15px] first:border-t-0',
                  !canPublish && 'opacity-55'
                )}
              >
                <ServiceTile>FB</ServiceTile>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-body font-semibold text-ink">{page.name}</b>
                  <span className="text-caption text-text3">
                    {canPublish
                      ? (page.category ?? 'Facebook Page')
                      : 'You cannot create content on this Page'}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={!canPublish}
                  loading={connecting === page.id}
                  onClick={() => void handleConnect(page.id)}
                >
                  Connect
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
