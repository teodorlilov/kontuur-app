import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StepperSummary } from '@/features/sources/types'
import type { UrlAnalysisResponse } from '@/types/api'
import { ClientSetupFlow } from '../components/client-setup-flow'
import { StepEntry } from '../components/step-entry'
import { DraftSheet } from '../components/draft-sheet'
import { buildEmptyDraft } from '../lib/build-draft'

/**
 * The one flow that creates a client, in both of its voices.
 *
 * Agency cases pin today's behaviour word for word — the copy, the two ways out (Cancel and
 * Discard), the wordmark link, the blocked save on a blank form — so the solo variant cannot
 * change any of it by accident. Solo cases pin what makes it a first run: the workspace's own
 * name already on the sheet, a profile rather than a client being saved, and no way to leave a
 * flow the workspace is redirected into until it has a client.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}))

const createClient = vi.fn()
vi.mock('@/features/clients/actions/client-actions', () => ({
  createClient: (input: unknown) => createClient(input),
}))

vi.mock(import('@/features/onboarding/hooks/use-extraction-status'), async (importOriginal) => ({
  ...(await importOriginal()),
  useExtractionStatus: () => ({ status: 'idle' as const }),
}))

const SUMMARY: StepperSummary = {
  hasWebsite: false,
  pageCount: 0,
  feedCount: 0,
  documentCount: 0,
  webSearchEnabled: true,
}
vi.mock('@/features/sources/components/stepper/pillar-source-stepper', () => ({
  PillarSourceStepper: ({ onFinished }: { onFinished: (summary: StepperSummary) => void }) => (
    <button type="button" onClick={() => onFinished(SUMMARY)}>
      Finish sources
    </button>
  ),
}))

const ANALYSIS: UrlAnalysisResponse = {
  detected_business_name: 'Acme Studio',
  detected_niche: 'Branding agency',
  detected_niche_confidence: 'high',
  detected_target_audience: ['Founders'],
  detected_tone: 'Plain and confident.',
  detected_content_pillars: [{ pillar: 'Work', weight: 100 }],
  detected_services_products: [],
  detected_language: 'English',
  detected_language_formality: 'neutral',
  detected_is_health_niche: false,
  detected_avoid_topics: null,
}

/** Routes the flow's four endpoints; only the site read carries content. */
function stubFetch(analysis: UrlAnalysisResponse | null = ANALYSIS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/ai/analyze-url') {
        return { ok: analysis !== null, json: async () => analysis }
      }
      if (url === '/api/sources/discover') return { ok: true, json: async () => ({ pages: [] }) }
      if (url === '/api/ai/suggest-sources') {
        return { ok: true, json: async () => ({ suggestions: [] }) }
      }
      return { ok: false, json: async () => ({}) }
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({ ok: true, data: 'client-1' })
  stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ClientSetupFlow — agency', () => {
  it('speaks about a client and offers both ways out', () => {
    render(<ClientSetupFlow isSolo={false} businessName="" />)

    expect(screen.getByRole('heading', { name: 'Add a client' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Client website' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set them up by hand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /kontuur/i })).toHaveAttribute('href', '/clients')
  })

  it('blocks a blank form on the name and saves a client once it has one', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo={false} businessName="" />)

    await user.click(screen.getByRole('button', { name: 'Set them up by hand' }))
    expect(screen.getByRole('heading', { name: 'New client' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save client →' })).toBeDisabled()
    expect(screen.getByText('Name still needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Acme')
    await user.click(screen.getByRole('button', { name: 'Save client →' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Client saved'))
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme' }))
  })

  it('drafts the name the site read detected', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo={false} businessName="" />)

    await user.type(screen.getByRole('textbox', { name: 'Client website' }), 'acme.com')
    await user.click(screen.getByRole('button', { name: 'Read the site →' }))

    expect(await screen.findByRole('heading', { name: 'Acme Studio' })).toBeInTheDocument()
    expect(screen.getByText('the page title')).toBeInTheDocument()
  })

  it('leaves to the roster when a discard is confirmed', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo={false} businessName="" />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Leave client setup?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(push).toHaveBeenCalledWith('/clients')
  })
})

describe('ClientSetupFlow — solo', () => {
  it('speaks to the owner and has no way out', () => {
    render(<ClientSetupFlow isSolo businessName="Acme" />)

    expect(screen.getByRole('heading', { name: 'Set up your business' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your website' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set it up by hand' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens the blank form with the business already named and saveable', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo businessName="Acme" />)

    await user.click(screen.getByRole('button', { name: 'Set it up by hand' }))
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile →' })).toBeEnabled()
    expect(screen.queryByText(/still needed/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
  })

  it('keeps the name the site read detected over the signup name', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo businessName="Acme" />)

    await user.type(screen.getByRole('textbox', { name: 'Your website' }), 'acme.com')
    await user.click(screen.getByRole('button', { name: 'Read the site →' }))

    expect(await screen.findByRole('heading', { name: 'Acme Studio' })).toBeInTheDocument()
  })

  it('saves a profile, then hands over to generation', async () => {
    const user = userEvent.setup()
    render(<ClientSetupFlow isSolo businessName="Acme" />)

    await user.click(screen.getByRole('button', { name: 'Set it up by hand' }))
    await user.click(screen.getByRole('button', { name: 'Save profile →' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Profile saved'))
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme' }))

    await user.click(await screen.findByRole('button', { name: 'Finish sources' }))
    expect(await screen.findByRole('heading', { name: 'Acme is ready' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate first post ideas' }))
    expect(push).toHaveBeenCalledWith('/generate?client=client-1')
  })
})

describe('StepEntry', () => {
  it('addresses an agency about their client, and a solo owner about themselves', () => {
    const noop = vi.fn()
    const { rerender } = render(
      <StepEntry
        websiteUrl=""
        onWebsiteUrlChange={noop}
        onAnalyze={noop}
        onSkip={noop}
        isSolo={false}
      />
    )
    expect(screen.getByRole('heading', { name: 'Add a client' })).toBeInTheDocument()

    rerender(
      <StepEntry websiteUrl="" onWebsiteUrlChange={noop} onAnalyze={noop} onSkip={noop} isSolo />
    )
    expect(screen.getByRole('heading', { name: 'Set up your business' })).toBeInTheDocument()
  })
})

describe('DraftSheet', () => {
  it('names an unnamed draft for whoever is filling it in', () => {
    const noop = vi.fn()
    const { rerender } = render(
      <DraftSheet
        draft={buildEmptyDraft()}
        onChange={noop}
        provenance={{}}
        unanswered={[]}
        resolved={[]}
        manual
        isSolo={false}
      />
    )
    expect(screen.getByRole('heading', { name: 'New client' })).toBeInTheDocument()

    rerender(
      <DraftSheet
        draft={buildEmptyDraft()}
        onChange={noop}
        provenance={{}}
        unanswered={[]}
        resolved={[]}
        manual
        isSolo
      />
    )
    expect(screen.getByRole('heading', { name: 'Your business' })).toBeInTheDocument()
  })
})
