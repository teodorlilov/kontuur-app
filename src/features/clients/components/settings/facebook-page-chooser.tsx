'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { connectFacebookPage } from '@/features/clients/actions/connection-actions'
import { ServiceTile } from '@/components/ui/service-row'
import { cn } from '@/utils/cn'
import type { ChoosablePage } from '@/features/clients/actions/connection-actions'
import type { ActionResult } from '@/lib/actions/types'

interface FacebookPageChooserProps {
  clientId: string
  /** Loaded by the page when the callback returns with `?choose_page=1`. */
  pages: ActionResult<ChoosablePage[]>
  onClose: () => void
}

/**
 * Which Page this client publishes to.
 *
 * Instagram's consent names the account it connects, so there is nothing to pick. Facebook's
 * yields a token that reaches every Page the person administers, which is why connecting is two
 * steps and why this exists at all.
 *
 * A Page the app cannot post to is shown and refused rather than hidden: "my Page isn't in the
 * list" is a worse thing to debug than a Page that says why it cannot be used.
 *
 * Empty is not one case, and saying "you administer no Pages" when it isn't sends the person to
 * fix the wrong thing. `fetchFacebookPages` lists from what the person granted rather than from
 * `/me/accounts`, so a ticked Page reaches this screen even when that edge stays silent about it.
 * What is left is the genuine case — nothing was ticked — which is what the empty state says.
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
      {!pages.ok ? (
        <p className="text-body text-text2">{pages.error}. Start the connection again.</p>
      ) : pages.data.length === 0 ? (
        <p className="text-body text-text2">
          You did not give Kontuur access to any Page. Connect again and, on the Facebook screen,
          choose <b className="font-semibold text-ink">Edit settings</b> — then tick the Page you
          want before continuing.
        </p>
      ) : (
        <ul className="flex flex-col">
          {pages.data.map((page) => {
            return (
              <li
                key={page.id}
                className={cn(
                  'flex items-center gap-3.5 border-t border-line py-[15px] first:border-t-0',
                  !page.canPublish && 'opacity-55'
                )}
              >
                <ServiceTile>FB</ServiceTile>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-body font-semibold text-ink">{page.name}</b>
                  <span className="text-caption text-text3">
                    {page.canPublish
                      ? (page.category ?? 'Facebook Page')
                      : 'This app was not given permission to post to this Page'}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={!page.canPublish}
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
