'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AuthView } from './auth-dialog-provider'
import { useAuthDialog } from './auth-dialog-provider'
import { ResetSentView, ResetView } from './reset-view'
import { SignInView } from './sign-in-view'
import { SignUpView } from './sign-up-view'

interface AuthDialogProps {
  view: AuthView | null
  initialError?: string
}

/**
 * The auth dialog frame.
 *
 * Built on Radix directly rather than on `components/ui/modal.tsx`: that frame
 * bakes in a titled header row with a divider and uniform body padding, and
 * none of the four views wants any of it — three centre their own lockup and
 * the fourth is a two-column split that has to bleed to the edge. The overlay,
 * the animations and the z-indices are copied from it verbatim so the two
 * behave identically.
 *
 * Focus trap, Escape, click-outside and focus restoration are Radix's.
 */
export function AuthDialog({ view, initialError }: AuthDialogProps) {
  const { close } = useAuthDialog()
  const isSplit = view === 'signup'

  return (
    <Dialog.Root open={view !== null} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-forest-deep/40 backdrop-blur-[10px] [animation:fade-in_200ms_ease]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-[201] w-[90vw] -translate-x-1/2 -translate-y-1/2',
            'max-h-[90vh] overflow-y-auto overscroll-contain outline-none',
            'rounded-card border border-line bg-surface shadow-frame',
            '[animation:scale-in_200ms_cubic-bezier(0.16,1,0.3,1)]',
            // The split view carries a second column; the rest are one narrow form.
            isSplit ? 'max-w-[900px]' : 'max-w-[432px]',
            !isSplit && 'p-8 md:p-9'
          )}
        >
          <Dialog.Close asChild>
            <button
              aria-label="Close"
              className="absolute right-3.5 top-3.5 z-10 grid size-8 place-items-center rounded-full text-text3 transition-colors duration-150 ease-contour hover:bg-ink/[0.04] hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          </Dialog.Close>

          {view === 'signin' && <SignInView initialError={initialError} />}
          {view === 'signup' && <SignUpView />}
          {view === 'reset' && <ResetView />}
          {view === 'sent' && <ResetSentView />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
