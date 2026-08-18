import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, renderHook, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReviewKeyboard } from '../use-review-keyboard'
import { useDraftEdits } from '../use-draft-edits'
import type { ReviewDraft } from '../types'

/**
 * The review surface's interaction model — the two hooks both review surfaces share
 * (`features/review/review-queue` and `features/generate/review-view`).
 *
 * These, rather than a render of `review-queue` itself, are batch 4. The queue is 848
 * lines with 41 imports and 31 hook calls, and §7.12 already recorded why rendering it
 * would not buy what it looks like it buys: the defect worth catching there (apply-style
 * needing two clicks) only reproduces when a PARENT re-renders with a fresh
 * `docsByPosition`, so a test with static props passes happily. Catching it needs the
 * insight the test was supposed to substitute for. That one is Playwright-shaped.
 *
 * What IS jsdom-shaped is right here. `useReviewKeyboard` binds `window` and guards
 * against firing while the visitor is typing or a dialog is open — the same class as the
 * "⌘Z reaching the canvas through an open dialog" defect §7.12 lists, and one of the
 * three that section says jsdom does catch.
 */

interface Handlers {
  onPrev: () => void
  onNext: () => void
  onApprove: () => void
  onDiscard: () => void
}

function Harness({ enabled = true, handlers }: { enabled?: boolean; handlers: Handlers }) {
  useReviewKeyboard({ enabled, ...handlers })
  return (
    <div>
      <input aria-label="Caption" />
      <textarea aria-label="Notes" />
      <div aria-label="Rich text" contentEditable suppressContentEditableWarning />
      <button type="button">Somewhere to focus</button>
    </div>
  )
}

let handlers: { [K in keyof Handlers]: ReturnType<typeof vi.fn<() => void>> }

beforeEach(() => {
  handlers = {
    onPrev: vi.fn<() => void>(),
    onNext: vi.fn<() => void>(),
    onApprove: vi.fn<() => void>(),
    onDiscard: vi.fn<() => void>(),
  }
})

describe('useReviewKeyboard', () => {
  it('moves with the arrows and acts on A and D', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)

    await user.keyboard('{ArrowRight}')
    expect(handlers.onNext).toHaveBeenCalledTimes(1)
    await user.keyboard('{ArrowLeft}')
    expect(handlers.onPrev).toHaveBeenCalledTimes(1)
    await user.keyboard('a')
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    await user.keyboard('d')
    expect(handlers.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('accepts the shifted letters too', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)
    await user.keyboard('A')
    await user.keyboard('D')
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    expect(handlers.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('stays silent while typing in an input', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)

    // The defect this prevents: editing a caption, typing the word "and", and having the
    // 'a' approve the post out from under you.
    await user.click(screen.getByLabelText('Caption'))
    await user.keyboard('and a draft')
    expect(handlers.onApprove).not.toHaveBeenCalled()
    expect(handlers.onDiscard).not.toHaveBeenCalled()
  })

  it('stays silent while typing in a textarea', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)
    await user.click(screen.getByLabelText('Notes'))
    await user.keyboard('add detail')
    expect(handlers.onApprove).not.toHaveBeenCalled()
    expect(handlers.onDiscard).not.toHaveBeenCalled()
  })

  it('stays silent in a contentEditable', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)
    const editable = screen.getByLabelText('Rich text')

    // jsdom sets the `contenteditable` ATTRIBUTE but never implements the
    // `isContentEditable` PROPERTY — it reads `undefined` — so the hook's guard has
    // nothing truthful to read and the branch is unreachable here by default. Supplied
    // rather than skipped: with a real value the branch itself is what gets tested, and
    // the alternative is a test that silently proves nothing.
    //
    // Worth knowing generally. This is the minority §7.12 describes from the inside: even
    // inside jsdom's own third of the problem, some of it is not really there.
    Object.defineProperty(editable, 'isContentEditable', { value: true, configurable: true })

    await user.click(editable)
    await user.keyboard('a')
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('stays silent while a dialog is open', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Harness handlers={handlers} />
        <div role="dialog" aria-label="Schedule" />
      </>
    )

    // Exactly the §7.12 defect shape: a surface-level shortcut reaching past a dialog to
    // the thing underneath. Here 'd' would discard the draft the visitor is mid-way
    // through scheduling.
    await user.keyboard('{ArrowRight}')
    await user.keyboard('d')
    expect(handlers.onNext).not.toHaveBeenCalled()
    expect(handlers.onDiscard).not.toHaveBeenCalled()
  })

  it('is inert when disabled', async () => {
    const user = userEvent.setup()
    render(<Harness enabled={false} handlers={handlers} />)
    await user.keyboard('{ArrowRight}a d')
    expect(handlers.onNext).not.toHaveBeenCalled()
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('unbinds on unmount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness handlers={handlers} />)
    unmount()
    await user.keyboard('a')
    // A listener surviving unmount would act on a surface that is no longer shown —
    // and would accumulate one more per mount.
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('ignores keys it does not own', async () => {
    const user = userEvent.setup()
    render(<Harness handlers={handlers} />)
    await user.keyboard('{ArrowUp}{ArrowDown}{Enter}z')
    expect(handlers.onNext).not.toHaveBeenCalled()
    expect(handlers.onPrev).not.toHaveBeenCalled()
    expect(handlers.onApprove).not.toHaveBeenCalled()
    expect(handlers.onDiscard).not.toHaveBeenCalled()
  })
})

function draft(id: string, caption: string | null, slides: unknown = null): ReviewDraft {
  return { post: { id, caption, slides_json: slides } } as unknown as ReviewDraft
}

describe('useDraftEdits', () => {
  it('derives its default from the draft rather than seeding on mount', () => {
    const { result } = renderHook(() => useDraftEdits())
    expect(result.current.editsFor(draft('a', 'Original'))).toEqual({
      caption: 'Original',
      slidesJson: null,
    })
  })

  it('lets a stored edit win over the draft', () => {
    const { result } = renderHook(() => useDraftEdits())
    act(() => result.current.setEdits('a', { caption: 'Edited', slidesJson: null }))
    // The documented reason nothing is seeded on mount: an explicit setEdits — after a
    // rewrite, say — must beat whatever the draft still carries.
    expect(result.current.editsFor(draft('a', 'Original')).caption).toBe('Edited')
  })

  it('keeps drafts independent', () => {
    const { result } = renderHook(() => useDraftEdits())
    act(() => result.current.setEdits('a', { caption: 'Edited A', slidesJson: null }))
    // An edit leaking across drafts is an edit saved onto the wrong post.
    expect(result.current.editsFor(draft('b', 'Original B')).caption).toBe('Original B')
  })

  it('treats a null caption as empty rather than passing null through', () => {
    const { result } = renderHook(() => useDraftEdits())
    expect(result.current.editsFor(draft('a', null)).caption).toBe('')
  })
})
