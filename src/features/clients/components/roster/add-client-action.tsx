import Link from 'next/link'
import { ActionLink } from '@/components/ui/action-link'
import { Button } from '@/components/ui/button'
import { PLAN_AND_BILLING_PATH } from '@/utils/constants'

/**
 * The roster header's one primary action. When the plan has no room for another brand the action
 * is disabled where it stands, with the reason and the way past it beside it — a member is not
 * walked through the whole new-client form to be refused at the end of it. On a paid workspace
 * the line under the link says what one more costs, before the form is opened.
 */
export function AddClientAction({
  refusal,
  note,
}: {
  refusal: string | null
  note?: string | null
}) {
  if (refusal === null) {
    const link = (
      <ActionLink href="/clients/new">
        Add client
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
      <Button type="button" disabled title={refusal} aria-describedby="add-client-refusal">
        Add client
      </Button>
      <p id="add-client-refusal" className="text-caption text-text2">
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
