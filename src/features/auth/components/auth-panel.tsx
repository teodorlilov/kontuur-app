'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Wordmark } from '@/components/layout/wordmark'
import { cn } from '@/utils/cn'

/**
 * Auth fields sit on Sunken rather than Surface.
 *
 * DESIGN.md § Inputs sanctions both grounds; inside a white dialog the sunken
 * well is what tells you where to type, because a white field on a white card
 * has only its border to say so. Everything else — height, radius, focus halo —
 * stays exactly the shared control.
 */
export const FIELD_SURFACE = 'bg-sunken'

interface AuthPanelProps {
  title: React.ReactNode
  description?: React.ReactNode
  /**
   * Render the title and description as Radix `Dialog.Title` / `Dialog.Description`.
   *
   * Those primitives read dialog context and throw outside a `Dialog.Root`, so
   * this cannot simply always be on: the same panel dresses two real routes
   * (`/signup/check-email` and `/setup-password`), which an email link opens
   * with no dialog around them.
   */
  asDialog?: boolean
  children?: React.ReactNode
  className?: string
}

/**
 * The chrome every auth surface shares: the lockup, a title, a line of context.
 *
 * This replaced `auth-layout.tsx`, a full-viewport split screen with a rotating
 * marketing slider down one side. A dialog over the landing page has the whole
 * landing page as its context, so the second panel had nothing left to say.
 */
export function AuthPanel({
  title,
  description,
  asDialog = false,
  children,
  className,
}: AuthPanelProps) {
  const Title = asDialog ? Dialog.Title : 'h1'
  const Description = asDialog ? Dialog.Description : 'p'

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-5 flex justify-center">
        <Wordmark />
      </div>
      <Title className="text-center text-headline font-semibold text-ink">{title}</Title>
      {description && (
        <Description className="mt-1.5 text-center text-body text-text2">{description}</Description>
      )}
      {children && <div className="mt-7">{children}</div>}
    </div>
  )
}

interface AuthLinkProps {
  onClick: () => void
  children: React.ReactNode
}

/**
 * A view switch inside the dialog.
 *
 * A button rather than an anchor on purpose — nothing navigates, so an `<a>`
 * here would promise a destination that does not exist and break
 * open-in-new-tab for anyone who tried it.
 */
export function AuthLink({ onClick, children }: AuthLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xs font-medium text-spring-text underline-offset-4 transition-colors duration-150 ease-contour hover:text-forest hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
    >
      {children}
    </button>
  )
}

/**
 * The server's answer, shown above the submit button.
 *
 * Auth failures used to go to a toast in the top-right corner — away from the
 * form, gone in seconds, and easy to miss entirely while looking at the field
 * you just typed in. `role="alert"` because it appears in response to an action
 * the visitor just took.
 */
export function AuthFormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger-line bg-danger-bg px-3 py-2 text-caption text-danger"
    >
      {children}
    </p>
  )
}
