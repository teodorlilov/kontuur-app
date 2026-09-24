import Link from 'next/link'
import { ActionLink } from '@/components/ui/action-link'
import { Button } from '@/components/ui/button'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

interface GatedActionProps {
  href: string
  label: string
  /** Why the plan will not allow it, or null when it will. */
  refusal: string | null
  /** What it costs, said before the page is opened — shown only when the action is allowed. */
  note?: string | null
  /** Ties the reason to the disabled control for a screen reader; unique per page. */
  refusalId: string
}

/**
 * A header's primary action that the plan may refuse: the link as usual, or the same control
 * disabled where it stands with the reason and the way past it underneath — nobody is walked
 * through a form or a wizard to be refused at the end of it.
 *
 * Shared by "Add client" (the roster) and "Generate posts" (the dashboard), which is why it is
 * here rather than in either feature: the two refusals are the same shape and the same promise,
 * and a second copy of this block is how they would come to word it differently.
 */
export function GatedAction({ href, label, refusal, note, refusalId }: GatedActionProps) {
  if (refusal === null) {
    const link = (
      <ActionLink href={href}>
        {label}
        <span aria-hidden="true">&rarr;</span>
      </ActionLink>
    )
    if (!note) return link
    return (
      <div className="flex flex-col items-end gap-1">
        {link}
        <p className="text-caption text-text2">{note}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" disabled title={refusal} aria-describedby={refusalId}>
        {label}
      </Button>
      <p id={refusalId} className="text-caption text-text2">
        {refusal}{' '}
        <Link
          href={PLAN_AND_BILLING_PATH}
          className="text-forest underline decoration-forest/40 underline-offset-2"
        >
          Plan &amp; billing
        </Link>
      </p>
    </div>
  )
}
