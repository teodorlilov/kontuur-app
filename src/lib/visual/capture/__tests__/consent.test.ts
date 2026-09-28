// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Page } from 'puppeteer-core'
import { dismissConsent } from '../consent'

/**
 * The page's functions run here in jsdom, as puppeteer would run them in the captured page. WHY
 * as: dismissConsent calls only `evaluate`, so a page with that one member stands in for Page.
 */
function pageRunningInDocument(): Page {
  return { evaluate: (fn: () => unknown) => Promise.resolve(fn()) } as unknown as Page
}

describe('dismissConsent', () => {
  it('clicks a short accept control, and nothing past the first', async () => {
    document.body.innerHTML = `
      <button type="button">Read our cookie policy in full</button>
      <a href="#consent">Accept all</a>
      <button type="button">Allow</button>`
    const [policy, accept, allow] = Array.from(document.querySelectorAll('a, button'))
    const clicks = [policy, accept, allow].map((el) => {
      const onClick = vi.fn((event: Event) => event.preventDefault())
      el!.addEventListener('click', onClick)
      return onClick
    })

    await dismissConsent(pageRunningInDocument())

    expect(clicks.map((onClick) => onClick.mock.calls.length)).toEqual([0, 1, 0])
  })
})
