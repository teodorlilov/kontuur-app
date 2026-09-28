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
  /** The control's weight beside a page's other actions; primary unless said. */
  variant?: 'primary' | 'secondary'
  /** Whether Plan & billing is the way past the refusal — false when the refusal is not a plan's. */
  wayOut?: boolean
}

/**
 * A header action that the plan may refuse, drawn at the weight its caller picks: the link as
 * usual, or the same control disabled where it stands with the reason and the way past it
 * underneath — nobody is walked through a form or a wizard to be refused at the end of it.
 *
 * Shared by "Add client" (the roster and the dashboard) and "Generate posts" (the dashboard),
 * which is why it is here rather than in either feature: the two refusals are the same shape and
 * the same promise, and a second copy of this block is how they would come to word it differently.
 */
export function GatedAction({
  href,
  label,
  refusal,
  note,
  refusalId,
  variant = 'primary',
  wayOut = true,
}: GatedActionProps) {
  if (refusal === null) {
    const link = (
      <ActionLink href={href} variant={variant}>
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
      <Button type="button" variant={variant} disabled title={refusal} aria-describedby={refusalId}>
        {label}
      </Button>
      <p id={refusalId} className="text-caption text-text2">
        {refusal}
        {wayOut && (
          <>
            {' '}
            <Link
              href={PLAN_AND_BILLING_PATH}
              className="text-forest underline decoration-forest/40 underline-offset-2"
            >
              Plan &amp; billing
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
