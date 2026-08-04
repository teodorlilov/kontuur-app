'use client'

import { useState } from 'react'
import { Link2, Mail } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { QueuePost } from '@/features/review/lib/queue-post'

interface SendToClientDialogProps {
  post: QueuePost | null
  onClose: () => void
  /** The batch was created — the caller marks the post as waiting. */
  onSent: (postId: string) => void
}

/**
 * Escalation: this post needs the client's eyes before it ships. Both paths
 * create a fresh 48-hour approval link for exactly this post (re-sending
 * reissues the link — the old one dies with its tokens).
 */
export function SendToClientDialog({ post, onClose, onSent }: SendToClientDialogProps) {
  const [sending, setSending] = useState<'email' | 'send' | null>(null)

  async function send(kind: 'email' | 'send') {
    if (!post) return
    setSending(kind)
    try {
      const res = await fetch(`/api/approval/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: post.client_id, postIds: [post.id] }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? 'Failed to send for approval')
        return
      }
      if (kind === 'send') {
        await navigator.clipboard.writeText((data as { url: string }).url)
        toast.success('Approval link copied')
      } else {
        toast.success('Approval email sent')
      }
      onSent(post.id)
    } catch {
      toast.error('Failed to send for approval')
    } finally {
      setSending(null)
    }
  }

  return (
    <Modal
      open={post !== null}
      onClose={onClose}
      title={post ? `Send to ${post.client_name} for sign-off` : ''}
      maxWidth={420}
    >
      <div className="flex flex-col gap-4 p-7 pt-4">
        <p className="text-caption text-text2">
          The client gets a link — no login — that shows this post and asks for a verdict. It
          expires after 48 hours; their answer arrives as a notification, and the post waits in
          its own tab meanwhile.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            loading={sending === 'email'}
            disabled={sending !== null}
            onClick={() => void send('email')}
          >
            <Mail aria-hidden className="mr-2 size-3.5" strokeWidth={1.8} />
            Email the client
          </Button>
          <Button
            variant="secondary"
            loading={sending === 'send'}
            disabled={sending !== null}
            onClick={() => void send('send')}
          >
            <Link2 aria-hidden className="mr-2 size-3.5" strokeWidth={1.8} />
            Copy approval link
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
